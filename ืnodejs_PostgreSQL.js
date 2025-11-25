// Import required modules
require('dotenv').config();
console.log(require('dotenv').config());

const express = require('express');
const path = require('path');
const app = express();
// 1. เปลี่ยนจาก mssql เป็น pg (PostgreSQL driver)
const { Pool } = require('pg');
const bodyParser = require('body-parser');

// 1. IMPORT PASSPORT AND SESSION PACKAGES
const session = require('express-session');
const passport = require('passport');
const FacebookStrategy = require('passport-facebook').Strategy;

// Load environment variables (assuming you use a package like 'dotenv' or set them in your environment)
const port = process.env.PORT || 3000;

// Database Credentials (เปลี่ยนมาใช้ DATABASE_URL แทนการแยก field)
const DATABASE_URL = process.env.DATABASE_URL; // URL การเชื่อมต่อ PostgreSQL (e.g., postgres://user:password@host:port/database)

// Credentials เดิม (เก็บไว้เป็น fallback หรือถ้า DATABASE_URL ไม่ได้ถูกกำหนด)
const DB_SERVER = process.env.DB_SERVER; // Hostname
const DB_USER = process.env.DB_USER;
const DB_PASSWORD = process.env.DB_PASSWORD;
const DB_NAME = process.env.DB_NAME;
const DB_PORT = process.env.DB_PORT || 5432; // PostgreSQL default port

// Facebook Credentials (MUST be set securely via environment variables)
const FACEBOOK_APP_ID = process.env.FACEBOOK_APP_ID;
const FACEBOOK_APP_SECRET = process.env.FACEBOOK_APP_SECRET;
const FACEBOOK_CALLBACK_URL = process.env.FACEBOOK_CALLBACK_URL || 'http://localhost:3000/auth/facebook/callback';

// 2. PostgreSQL Configuration (ใช้ DATABASE_URL เป็นหลัก ถ้ามี)
const config = DATABASE_URL ? {
    connectionString: DATABASE_URL,
    // สามารถเพิ่ม pool properties อื่นๆ ได้ที่นี่
} : {
    user: DB_USER,
    host: DB_SERVER,
    database: DB_NAME,
    password: DB_PASSWORD,
    port: DB_PORT,
    // pool properties can be added here, e.g., max: 20, idleTimeoutMillis: 30000,
};

let pool; // Connection Pool variable

// View setup (EJS)
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// 3. CONFIGURE SESSION MANAGEMENT
app.use(session({
    secret: 'a-very-secret-key-for-session-management', // ควรเปลี่ยนเป็นคีย์ที่ซับซ้อนและเก็บใน env
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 24 * 60 * 60 * 1000 } // Session expires in 24 hours
}));

// 4. INITIALIZE PASSPORT
app.use(passport.initialize());
app.use(passport.session());

// Passport serialization/deserialization logic
// บันทึกเฉพาะ UserId (Facebook ID) ลงใน Session
passport.serializeUser((user, done) => {
    done(null, user.UserId);
});

// 5. ดึงข้อมูลผู้ใช้จากฐานข้อมูลเมื่อมีการเรียกใช้ Session
passport.deserializeUser(async (id, done) => {
    try {
        // ใช้ pool.query และตัวแปรแบบ $1
        const queryText = 'SELECT "UserId", "DisplayName" FROM "Users" WHERE "UserId" = $1';
        const result = await pool.query(queryText, [id]);

        const user = result.rows[0]; // ใช้ .rows แทน .recordset
        if (user) {
            done(null, user); // User object attached to req.user
        } else {
            done(new Error('User not found'), null);
        }
    } catch (err) {
        console.error('Passport Deserialize Error:', err);
        done(err, null);
    }
});


// 6. PASSPORT FACEBOOK STRATEGY
passport.use(new FacebookStrategy({
    clientID: process.env.FACEBOOK_APP_ID,
    clientSecret: process.env.FACEBOOK_APP_SECRET,
    callbackURL: FACEBOOK_CALLBACK_URL,
    profileFields: ['id', 'displayName', 'emails', 'picture.type(large)'] // ข้อมูลที่ร้องขอจาก Facebook
},
async (accessToken, refreshToken, profile, done) => {
    // ฟังก์ชันนี้จะถูกเรียกเมื่อผู้ใช้ยืนยันตัวตนสำเร็จ
    try {
        const user = await findOrCreateUser(profile);
        done(null, user); // ส่ง user object ไปยัง serializeUser
    } catch (err) {
        done(err, null);
    }
}));


// 7. FUNCTION TO FIND OR CREATE USER IN POSTGRESQL
async function findOrCreateUser(profile) {
    const facebookId = profile.id;
    const displayName = profile.displayName;
    // ดึงอีเมล, บางครั้ง Facebook อาจไม่อนุญาตให้เข้าถึง
    const email = profile.emails && profile.emails.length > 0 ? profile.emails[0].value : null;
    // ดึง URL รูปโปรไฟล์
    const profilePhotoUrl = profile.photos && profile.photos.length > 0 ? profile.photos[0].value : null;

    try {
        // 1. ตรวจสอบว่ามีผู้ใช้อยู่แล้วหรือไม่
        const checkQuery = 'SELECT "UserId", "DisplayName" FROM "Users" WHERE "UserId" = $1';
        const checkResult = await pool.query(checkQuery, [facebookId]);

        if (checkResult.rows.length > 0) { // ใช้ .rows แทน .recordset
            console.log(`User ${displayName} found. Returning existing user.`);
            return checkResult.rows[0]; // คืนค่าผู้ใช้ที่มีอยู่แล้ว

        } else {
            // 2. หากยังไม่มี ให้ทำการบันทึกข้อมูลผู้ใช้ใหม่ (Register)
            const insertQuery = `
                INSERT INTO "Users" ("UserId", "DisplayName", "Email", "Provider", "ProfilePhotoUrl")
                VALUES ($1, $2, $3, $4, $5)
            `;
            const values = [facebookId, displayName, email, 'facebook', profilePhotoUrl];
            await pool.query(insertQuery, values);

            console.log(`New user ${displayName} registered successfully.`);
            // คืนค่า user object ที่สร้างขึ้นมาใหม่
            return { UserId: facebookId, DisplayName: displayName };
        }
    } catch (err) {
        console.error('Database Find/Create User Error:', err);
        throw new Error('Database error during user registration.');
    }
}

// 8. AUTHENTICATION CHECK MIDDLEWARE (ตรวจสอบว่า login หรือยัง)
function isAuthenticated(req, res, next) {
    // Passport.js จะเพิ่มฟังก์ชัน isAuthenticated() ให้กับ req
    if (req.isAuthenticated()) {
        return next();
    }
    // หากไม่ได้ Login ให้ redirect ไปหน้า Login
    res.redirect('/login');
}


// ***************************************************************
// [START NEW AUTHORIZATION LOGIC]
// ***************************************************************

/**
 * @description ตรวจสอบว่า UserId มีอยู่ในตาราง user_authorized หรือไม่
 * @param {string} userId - Facebook ID ของผู้ใช้
 * @returns {Promise<boolean>} - true ถ้าผู้ใช้ได้รับอนุญาต
 */
async function isUserAuthorized(userId) {
    // ต้องตรวจสอบ pool ก่อนเสมอ
    if (!pool) {
        console.error('Authorization check failed: Database pool is not connected/ready.');
        return false;
    }

    try {
        // ค้นหา UserId ในตาราง user_authorized (ใช้ $1)
        const result = await pool.query('SELECT "UserId" FROM "user_authorized" WHERE "UserId" = $1', [userId]);

        // ถ้า rows มีความยาว > 0 แสดงว่ามีสิทธิ์
        return result.rows.length > 0;
    } catch (err) {
        console.error('Database Authorization Check Error:', err);
        // หากเกิดข้อผิดพลาดในการเชื่อมต่อฐานข้อมูล ให้ถือว่าไม่ได้รับอนุญาตเพื่อความปลอดภัย
        return false;
    }
}

/**
 * @description MIDDLEWARE สำหรับตรวจสอบสิทธิ์การเข้าถึง (Authorization)
 * ต้องรันหลังจาก isAuthenticated() เท่านั้น
 */
async function isAuthorized(req, res, next) {
    // req.user ถูกกำหนดโดย Passport.js หลังจากการทำ deserializeUser สำเร็จ
    const userId = req.user.UserId;

    const authorized = await isUserAuthorized(userId);

    if (authorized) {
        // ได้รับอนุญาต ให้ไปต่อ
        console.log(`User ${userId} is Authorized. Access granted.`);
        return next();
    }

    // ไม่ได้รับอนุญาต ให้ redirect ไปหน้าแจ้งเตือน
    console.warn(`User ${userId} is NOT Authorized. Redirecting to unauthorized page.`);
    res.redirect('/unauthorized');
}

// ***************************************************************
// [END NEW AUTHORIZATION LOGIC]
// ***************************************************************


// Function to initialize connection pool and start the server
async function startServer() {
											
    try {
        // 9. Initialize PostgreSQL Connection Pool (pg.Pool)
        console.log(config);
        pool = new Pool(config);
        console.log('xxx');
        // ทดสอบการเชื่อมต่อ
        const client = await pool.connect();
        console.log('yyyy');
        client.release();
        console.log('PostgreSQL Database Connection Pool Created Successfully and Connected.');

        // -------------------------------------------------------------------
        // AUTHENTICATION ROUTES
        // -------------------------------------------------------------------

        // หน้า Login (ถ้า Login แล้วจะ Redirect ไปหน้าหลัก)
        app.get('/login', (req, res) => {
            if (req.isAuthenticated()) {
                return res.redirect('/schedule');
            }
            res.render('login');
        });

        // NEW: Unauthorized Page (หน้าแจ้งเตือนเมื่อไม่มีสิทธิ์)
        app.get('/unauthorized', (req, res) => {
            // แสดงหน้าแจ้งเตือนโดยไม่มีการตรวจสอบ Login (เพื่อให้ทุกคนเข้าถึงหน้านี้ได้)
            const userId = req.user ? req.user.UserId : null;
            res.render('unauthorized', { userId: userId });
        });

        // Facebook Auth Start - เริ่มต้นกระบวนการ Facebook Auth
        app.get('/auth/facebook',
            passport.authenticate('facebook', { scope: ['email', 'public_profile'] }) // ร้องขอสิทธิ์
        );

        // Facebook Auth Callback - Callback URL หลังผู้ใช้ยืนยันตัวตน
        app.get('/auth/facebook/callback',
            passport.authenticate('facebook', {
                successRedirect: '/schedule', // สำเร็จ ให้กลับไปหน้าหลัก (และจะเจอ isAuthorized)
                failureRedirect: '/login' // ล้มเหลว ให้กลับไปหน้า Login
            })
        );

        // Logout
        app.get('/logout', (req, res, next) => {
            req.logout(err => {
                if (err) { return next(err); }
                res.redirect('/login');
            });
        });


        // -------------------------------------------------------------------
        // PROTECTED ROUTES (ต้องผ่านการ Login และได้รับการอนุญาตก่อนจึงจะเข้าถึงได้)
        // -------------------------------------------------------------------

        // Root Endpoint (Home Page) - ใช้ isAuthenticated และ isAuthorized
        app.get("/", isAuthenticated, isAuthorized, async (req, res) => {
            // Redirect ไปหน้าตารางงานหลัก
            res.redirect('/schedule');
        });

        // 1. READ: Display schedule table (/schedule) - ใช้ isAuthenticated และ isAuthorized
        app.get("/schedule", isAuthenticated, isAuthorized, async (req, res) => {
            try {
                // คำสั่ง SQL สำหรับ PostgreSQL (ใช้ to_char() สำหรับ format date และใช้ double quotes)
                const queryText = `
                    SELECT
                        "OrderId" as id,
                        "CustomerName" as customer,
                        "Team" as team,
                        "Status" as status,
                        "Address" as address,
                        to_char("AppointmentDate", 'YYYY-MM-DD') as date,
                        "AppointmentTime" as time,
                        "JobType" as jobType
                    FROM "Schedule"
                    ORDER BY "AppointmentDate", "AppointmentTime"
                `;

                const result = await pool.query(queryText);

                console.log('load data from database completed');

                res.render('schedule', {
                    jobs: result.rows || [], // ใช้ .rows แทน .recordset
                    dbError: null,
                    user: req.user
                });

            } catch (err) {
                console.error('Database Query Error:', err);
                res.render('schedule', {
                    jobs: [],
                    dbError: 'ไม่สามารถดึงข้อมูลตารางงานได้ กรุณาตรวจสอบการเชื่อมต่อฐานข้อมูล: ' + err.message,
                    user: req.user
                });
            }
        });


        // 1.1 READ: JSON data for client-side refresh - ใช้ isAuthenticated และ isAuthorized
        app.get('/schedule/data', isAuthenticated, isAuthorized, async (req, res) => {
            try {
                // คำสั่ง SQL สำหรับ PostgreSQL (ใช้ to_char() สำหรับ format date)
                const queryText = `
                    SELECT
                        "OrderId" as id,
                        "CustomerName" as customer,
                        "Team" as team,
                        "Status" as status,
                        "Address" as address,
                        to_char("AppointmentDate", 'YYYY-MM-DD') as date,
                        "AppointmentTime" as time,
                        "JobType" as jobType
                    FROM "Schedule"
                    ORDER BY "AppointmentDate", "AppointmentTime"
                `;
                const result = await pool.query(queryText);

                res.json({
                    success: true,
                    jobs: result.rows || [] // ใช้ .rows แทน .recordset
                });

            } catch (err) {
                console.error('Database Query Error:', err);
                res.status(500).json({
                    success: false,
                    message: 'ไม่สามารถดึงข้อมูลตารางงานได้: ' + err.message
                });
            }
        });

        // 2. VIEW: Display input form - ใช้ isAuthenticated และ isAuthorized
        app.get("/schedule/input", isAuthenticated, isAuthorized, (req, res) => {
            res.render('input_schedule', { user: req.user });
        });


        // 3. CREATE: Insert new job (/schedule/new) - ใช้ isAuthenticated และ isAuthorized
        app.post("/schedule/new", isAuthenticated, isAuthorized, async (req, res) => {
            const newJobData = req.body;

            if (!newJobData.orderId || !newJobData.customerName) {
                return res.status(400).send({ message: 'กรุณากรอก Order ID และชื่อลูกค้าให้ครบถ้วน', success: false });
            }

            try {
                // ใช้คำสั่ง INSERT และตัวแปรแบบ $1, $2, ...
                const insertQuery = `
                    INSERT INTO "Schedule" ("OrderId", "CustomerName", "Address", "AppointmentDate", "AppointmentTime", "JobType", "Team", "Status")
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                `;
                const values = [
                    newJobData.orderId,
                    newJobData.customerName,
                    newJobData.address,
                    newJobData.appointmentDate,
                    newJobData.appointmentTime,
                    newJobData.jobType,
                    newJobData.team,
                    newJobData.status || 'scheduled'
                ];

                await pool.query(insertQuery, values);

                console.log('Job saved successfully.');
                res.status(201).send({ message: 'บันทึกงานใหม่สำเร็จ', success: true, jobId: newJobData.orderId });
            } catch (err) {
                console.error('Database insertion error:', err);
                res.status(500).send({ message: 'เกิดข้อผิดพลาดในการบันทึกข้อมูล: ' + err.message, success: false });
            }
        });


        // 4. UPDATE: Update existing job (/schedule/update) - ใช้ isAuthenticated และ isAuthorized
        app.post("/schedule/update", isAuthenticated, isAuthorized, async (req, res) => {
            const updatedJobData = req.body;

            const orderId = updatedJobData.orderId || updatedJobData.id;

            if (!orderId) {
                return res.status(400).send({ message: 'Order ID is required for update.', success: false });
            }

            try {
                // ใช้คำสั่ง UPDATE และตัวแปรแบบ $1, $2, ...
                const updateQuery = `
                    UPDATE "Schedule"
                    SET
                        "CustomerName" = $2,
                        "Address" = $3,
                        "AppointmentDate" = $4,
                        "AppointmentTime" = $5,
                        "JobType" = $6,
                        "Team" = $7,
                        "Status" = $8
                    WHERE "OrderId" = $1
                `;
                const values = [
                    orderId,
                    updatedJobData.customerName,
                    updatedJobData.address,
                    updatedJobData.appointmentDate,
                    updatedJobData.appointmentTime,
                    updatedJobData.jobType,
                    updatedJobData.team,
                    updatedJobData.status
                ];

                const result = await pool.query(updateQuery, values);

                if (result.rowCount === 0) { // ใช้ .rowCount แทน .rowsAffected[0]
                    return res.status(404).send({ message: `No job found with Order ID: ${orderId} to update.`, success: false });
                }

                res.status(200).send({ message: 'บันทึกการแก้ไขงานสำเร็จ', success: true, jobId: orderId });


            } catch (err) {
                console.error('Database update error:', err);

                res.status(500).send({ message: 'เกิดข้อผิดพลาดในการแก้ไขข้อมูล: ' + err.message, success: false });
            }
        });

        // 5. DELETE: Delete existing job (/schedule/delete) - ใช้ isAuthenticated และ isAuthorized
        app.post("/schedule/delete", isAuthenticated, isAuthorized, async (req, res) => {
            const { orderId } = req.body;


            if (!orderId) {
                return res.status(400).send({ message: 'Order ID is required for deletion.', success: false });
            }

            try {
                // ใช้คำสั่ง DELETE และตัวแปรแบบ $1
                const deleteQuery = `DELETE FROM "Schedule" WHERE "OrderId" = $1`;
                const result = await pool.query(deleteQuery, [orderId]);

                if (result.rowCount === 0) { // ใช้ .rowCount แทน .rowsAffected[0]
                    return res.status(404).send({ message: `ไม่พบงาน Order ID: ${orderId} ที่ต้องการลบ`, success: false });
                }

                res.status(200).send({ message: `ลบงาน Order ID: ${orderId} สำเร็จ`, success: true, jobId: orderId });

            } catch (err) {
                console.error('Database deletion error:', err);
                res.status(500).send({ message: 'เกิดข้อผิดพลาดในการลบข้อมูล: ' + err.message, success: false });
            }
        });

        // Start the Express server ONLY after successful DB connection
        app.listen(port, () =>
            console.log(`Server listening on port: ${port}`)
        );

    } catch (err) {
        // Critical error: Database connection failed
        console.error('CRITICAL ERROR: PostgreSQL Connection Pool Creation/Test Failed. Server not started.', err.message);

        process.exit(1);
    }
}

// Execute the server start function
startServer();

// Gracefully close the pool when the application is closing
process.on('SIGINT', async () => {
    if (pool) {
        try {
            await pool.end(); // ใช้ pool.end() สำหรับ pg
            console.log('PostgreSQL Connection Pool closed.');
        } catch (err) {
            console.error('Error closing pool:', err);
        }
    }
    process.exit(0);
});