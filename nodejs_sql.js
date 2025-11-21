// Import required modules
console.log(require('dotenv').config());

const express = require('express');
const path = require('path');
const app = express();
const sql = require('mssql');
const bodyParser = require('body-parser');

// 1. IMPORT PASSPORT AND SESSION PACKAGES
const session = require('express-session');
const passport = require('passport');
const FacebookStrategy = require('passport-facebook').Strategy;

// Load environment variables (assuming you use a package like 'dotenv' or set them in your environment)
const port = process.env.PORT || 3000;
// Database Credentials (MUST be set securely via environment variables)
const DB_SERVER = process.env.DB_SERVER;
const DB_USER = process.env.DB_USER;
const DB_PASSWORD = process.env.DB_PASSWORD;
const DB_NAME = process.env.DB_NAME;
// Facebook Credentials (MUST be set securely via environment variables)
const FACEBOOK_APP_ID = process.env.FACEBOOK_APP_ID;
const FACEBOOK_APP_SECRET = process.env.FACEBOOK_APP_SECRET;
const FACEBOOK_CALLBACK_URL = process.env.FACEBOOK_CALLBACK_URL || 'http://localhost:3000/auth/facebook/callback';
                                                                 
                                

// SQL Server (MSSQL) Configuration - ใช้รูปแบบมาตรฐาน user/password
const config = {
    server: DB_SERVER,
    database: DB_NAME,
    user: DB_USER,
    password: DB_PASSWORD,
                                
                                
    
    
    options: {
        encrypt: true, // Required for Azure/Cloud deployment
                                
        trustServerCertificate: true 
    }
};

         
          
     
     
let pool; // Connection Pool variable
    
                                 
 
    

// View setup (EJS)
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// 2. CONFIGURE SESSION MANAGEMENT
app.use(session({
    secret: 'a-very-secret-key-for-session-management', // ควรเปลี่ยนเป็นคีย์ที่ซับซ้อนและเก็บใน env
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 24 * 60 * 60 * 1000 } // Session expires in 24 hours
}));

// 3. INITIALIZE PASSPORT
app.use(passport.initialize());
app.use(passport.session());

// Passport serialization/deserialization logic
// บันทึกเฉพาะ UserId (Facebook ID) ลงใน Session
passport.serializeUser((user, done) => {
    done(null, user.UserId);
});

// ดึงข้อมูลผู้ใช้จากฐานข้อมูลเมื่อมีการเรียกใช้ Session
passport.deserializeUser(async (id, done) => {
    try {
        const result = await pool.request()
            .input('userId', sql.NVarChar, id)
            .query('SELECT UserId, DisplayName FROM Users WHERE UserId = @userId');
        
        const user = result.recordset[0];
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


// 4. PASSPORT FACEBOOK STRATEGY
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


// 5. FUNCTION TO FIND OR CREATE USER IN MSSQL
async function findOrCreateUser(profile) {
    const facebookId = profile.id;
    const displayName = profile.displayName;
    // ดึงอีเมล, บางครั้ง Facebook อาจไม่อนุญาตให้เข้าถึง
    const email = profile.emails && profile.emails.length > 0 ? profile.emails[0].value : null; 
    // ดึง URL รูปโปรไฟล์
    const profilePhotoUrl = profile.photos && profile.photos.length > 0 ? profile.photos[0].value : null;

    try {
        // 1. ตรวจสอบว่ามีผู้ใช้อยู่แล้วหรือไม่
        const checkResult = await pool.request()
            .input('userId', sql.NVarChar, facebookId)
            .query('SELECT UserId, DisplayName FROM Users WHERE UserId = @userId');

        if (checkResult.recordset.length > 0) {
            console.log(`User ${displayName} found. Returning existing user.`);
            return checkResult.recordset[0]; // คืนค่าผู้ใช้ที่มีอยู่แล้ว

        } else {
            // 2. หากยังไม่มี ให้ทำการบันทึกข้อมูลผู้ใช้ใหม่ (Register)
            await pool.request()
                .input('userId', sql.NVarChar, facebookId)
                .input('displayName', sql.NVarChar, displayName)
                .input('email', sql.NVarChar, email)
                .input('provider', sql.NVarChar, 'facebook')
                .input('profilePhotoUrl', sql.NVarChar, profilePhotoUrl)
                .query(`
                    INSERT INTO Users (UserId, DisplayName, Email, Provider, ProfilePhotoUrl) 
                    VALUES (@userId, @displayName, @email, @provider, @profilePhotoUrl)
                `);
            
            console.log(`New user ${displayName} registered successfully.`);
            // คืนค่า user object ที่สร้างขึ้นมาใหม่
            return { UserId: facebookId, DisplayName: displayName };
        }
    } catch (err) {
        console.error('Database Find/Create User Error:', err);
        throw new Error('Database error during user registration.');
    }
}

// 6. AUTHENTICATION CHECK MIDDLEWARE (ตรวจสอบว่า login หรือยัง)
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
    if (!pool || pool.connected === false) {
        console.error('Authorization check failed: Database pool is not connected.');
        return false;
    }
    
    try {
        // ค้นหา UserId ในตาราง user_authorized
        const result = await pool.request()
            .input('userId', sql.NVarChar, userId)
            .query('SELECT UserId FROM user_authorized WHERE UserId = @userId');
            
        // ถ้า recordset มีความยาว > 0 แสดงว่ามีสิทธิ์
        return result.recordset.length > 0;
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
        // Initialize Connection Pool and connect (รอจนกว่าจะเชื่อมต่อสำเร็จ)
        pool = new sql.ConnectionPool(config);
        await pool.connect();
        console.log('Database Connection Pool Created Successfully and Connected.');
          
          
          
                                
            
            
        
            
                                
    
 

        // -------------------------------------------------------------------
        // AUTHENTICATION ROUTES
        // -------------------------------------------------------------------

        // หน้า Login (ถ้า Login แล้วจะ Redirect ไปหน้าหลัก)
        app.get('/login', (req, res) => {
            if (req.isAuthenticated()) {
                return res.redirect('/'); 
            }
            res.render('login');
        });
        
        // 8. NEW: Unauthorized Page (หน้าแจ้งเตือนเมื่อไม่มีสิทธิ์)
        app.get('/unauthorized', (req, res) => {
            // แสดงหน้าแจ้งเตือนโดยไม่มีการตรวจสอบ Login (เพื่อให้ทุกคนเข้าถึงหน้านี้ได้)
            const userId = req.user ? req.user.UserId : null;
            res.render('unauthorized', { userId: userId });
        });

        // 7. Facebook Auth Start - เริ่มต้นกระบวนการ Facebook Auth
        app.get('/auth/facebook',
            passport.authenticate('facebook', { scope: ['email', 'public_profile'] }) // ร้องขอสิทธิ์
        );

        // 7. Facebook Auth Callback - Callback URL หลังผู้ใช้ยืนยันตัวตน
        // **สำคัญ:** ผู้ใช้จะถูก redirect ไปหน้าหลักเสมอ (ถ้าสำเร็จ) และจะถูกตรวจสอบสิทธิ์ใน route '/'
        app.get('/auth/facebook/callback',
            passport.authenticate('facebook', { 
                successRedirect: '/schedule', // สำเร็จ ให้กลับไปหน้าหลัก (และจะเจอ isAuthorized)
                failureRedirect: '/login' // ล้มเหลว ให้กลับไปหน้า Login
            })
        );

        // 7. Logout
        app.get('/logout', (req, res, next) => {
            req.logout(err => {
                if (err) { return next(err); }
                res.redirect('/login');
            });
        });


        // -------------------------------------------------------------------
        // PROTECTED ROUTES (ต้องผ่านการ Login และได้รับการอนุญาตก่อนจึงจะเข้าถึงได้)
        // ** ทุก Route ที่เคยใช้ isAuthenticated จะต้องเพิ่ม isAuthorized ต่อท้าย **
        // -------------------------------------------------------------------

        // Root Endpoint (Home Page) - ใช้ isAuthenticated และ isAuthorized
        app.get("/", isAuthenticated, isAuthorized, async (req, res) => {
            res.render('Index', { user: req.user });
        });

        // 1. READ: Display schedule table (/schedule) - ใช้ isAuthenticated และ isAuthorized
        app.get("/schedule", isAuthenticated, isAuthorized, async (req, res) => {
            try {
                                                             
                if (!pool || pool.connected === false) {
                    return res.render('schedule', {
                        jobs: [],
                        dbError: 'Database connection is not ready or has failed.',
                        user: req.user
                    });
                }

                const result = await pool.request().query(
                    `SELECT 
                        orderid as id, 
                        CustomerName as customer, 
                        Team as team, 
                        Status as status,
                        Address as address, 
                        FORMAT(AppointmentDate, 'yyyy-MM-dd') as date, 
                        AppointmentTime as time, 
                        JobType as jobType 
                    FROM schedule 
                    ORDER BY AppointmentDate, AppointmentTime`
                );

                console.log('load data from database completed');

                res.render('schedule', {
                    jobs: result.recordset || [],
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
                const result = await pool.request().query(
                    `SELECT 
                        orderid as id, 
                        CustomerName as customer, 
                        Team as team, 
                        Status as status, 
                        Address as address,
                        FORMAT(AppointmentDate, 'yyyy-MM-dd') as date, 
                        AppointmentTime as time, 
                        JobType as jobType 
                    FROM schedule 
                    ORDER BY AppointmentDate, AppointmentTime`
                );
                
              

                                                                

                res.json({
                    success: true,
                    jobs: result.recordset || []
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
                await pool.request() 
                    .input('orderId', sql.NVarChar, newJobData.orderId)
                    .input('customerName', sql.NVarChar, newJobData.customerName)
                    .input('address', sql.NVarChar, newJobData.address) 
                    .input('appointmentDate', sql.Date, newJobData.appointmentDate)
                    .input('appointmentTime', sql.NVarChar, newJobData.appointmentTime)
                    .input('jobType', sql.NVarChar, newJobData.jobType)
                    .input('team', sql.NVarChar, newJobData.team)
                    .input('status', sql.NVarChar, newJobData.status || 'scheduled')
                    
                    .query('INSERT INTO [Schedule] (OrderId, CustomerName, Address, AppointmentDate, AppointmentTime, JobType, Team, Status) VALUES (@orderId, @customerName, @address, @appointmentDate, @appointmentTime, @jobType, @team, @status)');

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
                const result = await pool.request() 
                    .input('orderId', sql.NVarChar, orderId)
                    .input('customerName', sql.NVarChar, updatedJobData.customerName)
                    .input('address', sql.NVarChar, updatedJobData.address)
                    .input('appointmentDate', sql.Date, updatedJobData.appointmentDate)
                    .input('appointmentTime', sql.NVarChar, updatedJobData.appointmentTime)
                    .input('jobType', sql.NVarChar, updatedJobData.jobType)
                    .input('team', sql.NVarChar, updatedJobData.team)
                    .input('status', sql.NVarChar, updatedJobData.status)
                    .query(`
                        UPDATE [Schedule]
                        SET 
                            CustomerName = @customerName,
                            Address = @address,
                            AppointmentDate = @appointmentDate,
                            AppointmentTime = @appointmentTime,
                            JobType = @jobType,
                            Team = @team,
                            Status = @status
                        WHERE OrderId = @orderId
                    `);

                if (result.rowsAffected[0] === 0) {
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
                const result = await pool.request() 
                    .input('orderId', sql.NVarChar, orderId)
                    .query(`DELETE FROM [Schedule] WHERE OrderId = @orderId`);
                
                if (result.rowsAffected[0] === 0) {
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
        console.error('CRITICAL ERROR: Database Connection Pool Creation Failed. Server not started.', err.message);
                                                         
        process.exit(1);
    }
}

// Execute the server start function
startServer();

// Gracefully close the pool when the application is closing
process.on('SIGINT', async () => {
    if (pool) {
        try {
            await pool.close();
            console.log('SQL Connection Pool closed.');
        } catch (err) {
            console.error('Error closing pool:', err);
        }
    }
    process.exit(0);
});