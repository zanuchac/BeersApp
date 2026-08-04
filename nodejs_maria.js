// nodejs_maria.js - Express Server, MariaDB/MySQL, and Facebook Passport Authentication

// 1. Import required modules
require('dotenv').config();
										

const express = require('express');
		
const app = express();
// ใช้ 'mysql2/promise' สำหรับการเชื่อมต่อ MariaDB/MySQL ที่รองรับ async/await
const { createPool } = require('mysql2/promise'); 
const bodyParser = require('body-parser');
const path = require('path');

// Passport and Session for Authentication
const session = require('express-session');
const passport = require('passport');
const FacebookStrategy = require('passport-facebook').Strategy;

// Load environment variables
const port = process.env.PORT || 3000;

// Database Credentials
const DB_SERVER = process.env.DB_SERVER;
const DB_USER = process.env.DB_USER;
const DB_PASSWORD = process.env.DB_PASSWORD;
const DB_NAME = process.env.DB_NAME;
const DB_PORT = process.env.DB_PORT || 3306; 

// Facebook Credentials
const FACEBOOK_APP_ID = process.env.FACEBOOK_APP_ID;
const FACEBOOK_APP_SECRET = process.env.FACEBOOK_APP_SECRET;
const FACEBOOK_CALLBACK_URL = process.env.FACEBOOK_CALLBACK_URL || 'http://localhost:3000/auth/facebook/callback';
				 
								
// Database Connection Pool Config
																													  
const dbConfig = {
    host: DB_SERVER,
    database: DB_NAME,
    user: DB_USER,
    password: DB_PASSWORD,
    port: DB_PORT,
    // การตั้งค่า Pool สำหรับประสิทธิภาพสูง
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
				
		
		  
  
};

// Global Connection Pool
let pool;
  
  
		  
 
		 
 
 

// ====================================
// 2. EXPRESS MIDDLEWARE AND PASSPORT SETUP
// ====================================

// View and Static setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Session Management
app.use(session({
    secret: 'a-very-secret-key-for-session-management', // ควรใช้ key ที่ซับซ้อนกว่านี้
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 ชั่วโมง
}));

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

// Passport Serialization/Deserialization
					 
passport.serializeUser((user, done) => {
    // เก็บแค่ UserId (Facebook ID) ลงใน Session
    done(null, user.UserId);
});

																													   
passport.deserializeUser(async (id, done) => {
    // ดึงข้อมูลผู้ใช้จาก DB ด้วย UserId
    try {
        if (!pool) return done(new Error('Database pool not ready'), null);
        
        // MariaDB/MySQL ใช้ ? เป็น placeholder
        const [rows] = await pool.execute(
			 
            'SELECT UserId, DisplayName FROM Users WHERE UserId = ?',
            [id]
        );

        const user = rows[0]; // ผลลัพธ์จาก mysql2 คือ [rows, fields]
        if (user) {
            done(null, user);
        } else {
            done(new Error('User not found in database'), null);
        }
    } catch (err) {
        console.error('Passport Deserialize Error:', err);
        done(err, null);
    }
});


// Passport Facebook Strategy
passport.use(new FacebookStrategy({
    clientID: FACEBOOK_APP_ID,
    clientSecret: FACEBOOK_APP_SECRET,
    callbackURL: FACEBOOK_CALLBACK_URL,
    profileFields: ['id', 'displayName', 'emails', 'picture.type(large)']
},
async (accessToken, refreshToken, profile, done) => {
										
    try {
        const user = await findOrCreateUser(profile);
        done(null, user);
    } catch (err) {
        done(err, null);
    }
}));


// 3. FUNCTION TO FIND OR CREATE USER IN MARIADB
																																			
async function findOrCreateUser(profile) {
    const facebookId = profile.id;
    const displayName = profile.displayName;
								  
    const email = profile.emails && profile.emails.length > 0 ? profile.emails[0].value : null;
			   
    const profilePhotoUrl = profile.photos && profile.photos.length > 0 ? profile.photos[0].value : null;

    try {
        // 1. ตรวจสอบว่ามีผู้ใช้อยู่แล้วหรือไม่
																	
        const [checkRows] = await pool.execute(
			   
            'SELECT UserId, DisplayName FROM Users WHERE UserId = ?',
            [facebookId]
        );

        if (checkRows.length > 0) {
            console.log(`User ${displayName} found. Returning existing user.`);
            return checkRows[0]; // คืนค่าผู้ใช้ที่มีอยู่แล้ว

        } else {
            // 2. หากยังไม่มี ให้ทำการบันทึกข้อมูลผู้ใช้ใหม่
            await pool.execute(
                `
				
			 
			   
				  
	  
                INSERT INTO Users (UserId, DisplayName, Email, Provider, ProfilePhotoUrl) 
                VALUES (?, ?, ?, ?, ?)
                `,
                [facebookId, displayName, email, 'facebook', profilePhotoUrl]
            );

            console.log(`New user ${displayName} registered successfully.`);
						 
            return { UserId: facebookId, DisplayName: displayName };
        }
    } catch (err) {
        console.error('Database Find/Create User Error:', err);
        throw new Error('Database error during user registration.');
    }
}

// 4. AUTHENTICATION AND AUTHORIZATION MIDDLEWARE

// Middleware: ตรวจสอบว่าเข้าสู่ระบบแล้วหรือไม่ (Authentication)
function isAuthenticated(req, res, next) {
						   
    if (req.isAuthenticated()) {
        return next();
    }
    // หากยังไม่เข้าสู่ระบบ ให้ไปหน้า login
    res.redirect('/login');
}


																  
								  
																  

/**
 * @description ตรวจสอบว่า UserId มีอยู่ในตาราง user_authorized หรือไม่ (Authorization)
																   
																									 
 */
async function isUserAuthorized(userId) {
				   
				
																					   
    if (!pool) return false;
	 

    try {
																	
        const [rows] = await pool.execute(
			  
            'SELECT UserId FROM user_authorized WHERE UserId = ?',
            [userId]
        );

        return rows.length > 0;
    } catch (err) {
        console.error('Database Authorization Check Error:', err);
        return false; // ปฏิเสธสิทธิ์หากมีปัญหา DB
					 
    }
}

/**
 * @description MIDDLEWARE สำหรับตรวจสอบสิทธิ์การเข้าถึง (Authorization)
					  
 */
async function isAuthorized(req, res, next) {
    // ต้องตรวจสอบ isAuthenticated ก่อนแล้วจึงมี req.user
    if (!req.user || !req.user.UserId) {
        return res.redirect('/login');
    }
    
    const userId = req.user.UserId;

    const authorized = await isUserAuthorized(userId);

    if (authorized) {
				  
        console.log(`User ${userId} is Authorized. Access granted.`);
        return next();
    }

							  
    console.warn(`User ${userId} is NOT Authorized. Redirecting to unauthorized page.`);
    res.redirect('/unauthorized');
}

																  
								
																  

// ====================================
// 5. SERVER INITIALIZATION AND ROUTES
// ====================================

															  
async function startServer() {
		
	
    try {
        // 1. สร้าง Connection Pool ของ MariaDB/MySQL
        pool = createPool(dbConfig);
		
					 
	
	
	
		
   
   
        
        // ทดสอบการเชื่อมต่อทันที
        await pool.execute('SELECT 1 + 1 AS solution'); 
        console.log('Database Connection Pool Created Successfully and Tested.');
 

        // -------------------------------------------------------------------
        // AUTHENTICATION ROUTES (ไม่ต้องใช้ isAuthorized)
        // -------------------------------------------------------------------

							
        app.get('/login', (req, res) => {
            if (req.isAuthenticated()) {
                return res.redirect('/');
            }
            res.render('login');
        });

								 
        app.get('/unauthorized', (req, res) => {
														 
            const userId = req.user ? req.user.UserId : null;
            res.render('unauthorized', { userId: userId });
        });

						  
        app.get('/auth/facebook',
            passport.authenticate('facebook', { scope: ['email', 'public_profile'] })
        );

							   
														   
        app.get('/auth/facebook/callback',
            passport.authenticate('facebook', {
                successRedirect: '/schedule',
                failureRedirect: '/login'
            })
        );

	 
        app.get('/logout', (req, res, next) => {
            req.logout(err => {
                if (err) { return next(err); }
                res.redirect('/login');
            });
        });
        

        // -------------------------------------------------------------------
        // PROTECTED ROUTES (ต้องใช้ isAuthenticated และ isAuthorized)
									 
        // -------------------------------------------------------------------

        // Root Endpoint (Redirect ไปหน้า Schedule)
        app.get("/", isAuthenticated, isAuthorized, (req, res) => {
            res.redirect('/schedule');
        });

        // ====================================
        // A. SCHEDULE ROUTES
        // ====================================

        // A.1 READ: Display schedule table (/schedule)
        app.get("/schedule", isAuthenticated, isAuthorized, async (req, res) => {
            try {
				
                if (!pool) {
												   
								 
                    return res.render('schedule', { jobs: [], dbError: 'Database connection is not ready or has failed.', user: req.user });
									  
					   
                }

                // ใช้ DATE_FORMAT สำหรับ MariaDB/MySQL
                const [rows] = await pool.execute(
                    `SELECT 
                        OrderId as id, 
                        CustomerName as customer, 
                        Team as team, 
                        Status as status,
                        Address as address, 
                        DATE_FORMAT(AppointmentDate, '%Y-%m-%d') as date, 
                        AppointmentTime as time, 
                        JobType as jobType 
                    FROM Schedule 
                    ORDER BY AppointmentDate, AppointmentTime`
                );

																 

                res.render('schedule', {
                    jobs: rows || [],
                    dbError: null,
                    user: req.user
                });

            } catch (err) {
                console.error('Database Query Error (Schedule):', err);
                res.render('schedule', {
                    jobs: [],
                    dbError: 'ไม่สามารถดึงข้อมูลตารางงานได้ กรุณาตรวจสอบการเชื่อมต่อฐานข้อมูล: ' + err.message,
                    user: req.user
                });
            }
        });

 

		  
        // A.1.1 READ: JSON data for client-side refresh
																																			
        app.get('/schedule/data', isAuthenticated, isAuthorized, async (req, res) => {
            try {
																										
                const [rows] = await pool.execute(
                    `SELECT 
                        OrderId as id, 
                        CustomerName as customer, 
                        Team as team, 
                        Status as status, 
                        Address as address,
                        DATE_FORMAT(AppointmentDate, '%Y-%m-%d') as date, 
                        AppointmentTime as time, 
                        JobType as jobType 
                    FROM Schedule 
                    ORDER BY AppointmentDate, AppointmentTime`
                );
				
                res.json({ success: true, jobs: rows || [] });

				

						  
								  
																									
				   

            } catch (err) {
                console.error('Database Query Error (Schedule Data):', err);
									  
								   
                res.status(500).json({ success: false, message: 'ไม่สามารถดึงข้อมูลตารางงานได้: ' + err.message });
				   
            }
        });

        // A.2 VIEW: Display input form
        app.get("/schedule/input", isAuthenticated, isAuthorized, (req, res) => {
            res.render('input_schedule', { user: req.user });
	
			
        });
        
 

        // A.3 CREATE: Insert new job (/schedule/new)
																																			  
	 
        app.post("/schedule/new", isAuthenticated, isAuthorized, async (req, res) => {
            const newJobData = req.body;
   

	 
   
	  
	
	
 
   
		   
 
	
	 
		  
  

 
		
	  
 
   
   
		
 
				

            if (!newJobData.orderId || !newJobData.customerName) {
                return res.status(400).send({ message: 'กรุณากรอก Order ID และชื่อลูกค้าให้ครบถ้วน', success: false });
            }
	  
	  
	
	   
	   
 

            try {
                // ใช้ ? ใน SQL และส่งค่าทั้งหมดใน Array (PreparedStatement)
                await pool.execute(
                    `
				  
					   
						
					
				 
					 
	 
                    INSERT INTO Schedule (OrderId, CustomerName, Address, AppointmentDate, AppointmentTime, JobType, Team, Status) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    `,
                    [
                        newJobData.orderId,
                        newJobData.customerName,
                        newJobData.address,
                        newJobData.appointmentDate,
                        newJobData.appointmentTime,
                        newJobData.jobType,
                        newJobData.team,
                        newJobData.status || 'Scheduled'
                    ]
                );

                console.log('Job saved successfully.');
                res.status(201).send({ message: 'บันทึกงานใหม่สำเร็จ', success: true, jobId: newJobData.orderId });
            } catch (err) {
                console.error('Database insertion error (Schedule):', err);
                res.status(500).send({ message: 'เกิดข้อผิดพลาดในการบันทึกข้อมูล: ' + err.message, success: false });
            }
        });

	 

        // A.4 UPDATE: Update existing job (/schedule/update)
																																			  
        app.post("/schedule/update", isAuthenticated, isAuthorized, async (req, res) => {
            const updatedJobData = req.body;
				 

            const orderId = updatedJobData.orderId || updatedJobData.id;
	  
 
	
	 
	   
	  
	  
	   
	 
	 
 
	
 
   
	 
	
   
   
   
   
	
	 
	
  
 
	
		 
 

            if (!orderId) {
                return res.status(400).send({ message: 'Order ID is required for update.', success: false });
            }

            try {
                const [result] = await pool.execute( 
                    `
					  
					 
						
						 
					 
				  
				   
	   
                    UPDATE Schedule
                    SET 
                        CustomerName = ?,
                        Address = ?,
                        AppointmentDate = ?,
                        AppointmentTime = ?,
                        JobType = ?,
                        Team = ?,
                        Status = ?
                    WHERE OrderId = ?
                    `,
                    [
                        updatedJobData.customerName,
                        updatedJobData.address,
                        updatedJobData.appointmentDate,
                        updatedJobData.appointmentTime,
                        updatedJobData.jobType,
                        updatedJobData.team,
                        updatedJobData.status,
                        orderId
                    ]
                );

																				 
                if (result.affectedRows === 0) {
                    return res.status(404).send({ message: `No job found with Order ID: ${orderId} to update.`, success: false });
                }

	
	
   
		
				 
                res.status(200).send({ message: 'บันทึกการแก้ไขงานสำเร็จ', success: true, jobId: orderId });
 

            } catch (err) {
                console.error('Database update error (Schedule):', err);
		
	   
 
	
	
                res.status(500).send({ message: 'เกิดข้อผิดพลาดในการแก้ไขข้อมูล: ' + err.message, success: false });
            }
        });

        // A.5 DELETE: Delete existing job (/schedule/delete)
																																			   
        app.post("/schedule/delete", isAuthenticated, isAuthorized, async (req, res) => {
			
            const { orderId } = req.body;
				  

            if (!orderId) {
                return res.status(400).send({ message: 'Order ID is required for deletion.', success: false });
            }

            try {
                const [result] = await pool.execute( 
			   
                    `DELETE FROM Schedule WHERE OrderId = ?`,
                    [orderId]
                );

																				 
                if (result.affectedRows === 0) {
                    return res.status(404).send({ message: `ไม่พบงาน Order ID: ${orderId} ที่ต้องการลบ`, success: false });
                }

				 
                res.status(200).send({ message: `ลบงาน Order ID: ${orderId} สำเร็จ`, success: true, jobId: orderId });

            } catch (err) {
                console.error('Database deletion error (Schedule):', err);
                res.status(500).send({ message: 'เกิดข้อผิดพลาดในการลบข้อมูล: ' + err.message, success: false });
            }
        });


        // ====================================
        // B. ORDER / QUOTATION ROUTES (NEWLY ADDED)
        // ====================================

        // B.1 VIEW: Display order list (/order)
        app.get("/input_order", isAuthenticated, isAuthorized, async (req, res) => {
            try {
                const [rows] = await pool.execute(
                    `SELECT 
                        OrderId, 
                        CustomerName, 
                        DATE_FORMAT(OrderDate, '%Y-%m-%d') as date, 
                        TotalAmount, 
                        Status 
                    FROM Orders 
                    ORDER BY OrderDate DESC`
                );

                res.render('input_order', {
                    orders: rows || [],
                    dbError: null,
                    user: req.user
                });
            } catch (err) {
                console.error('Order View DB Error:', err);
                res.render('input_order', {
                    orders: [],
                    dbError: 'ไม่สามารถดึงข้อมูลใบสั่งซื้อ/ใบเสนอราคาได้: ' + err.message,
                    user: req.user
                });
            }
        });

        // B.2 READ: JSON data for client-side refresh (Order list)
        app.get('/api/input_order/data', isAuthenticated, isAuthorized, async (req, res) => {
            try {
                const [rows] = await pool.execute(
                    `SELECT 
                        OrderId, 
                        CustomerName, 
                        DATE_FORMAT(OrderDate, '%Y-%m-%d') as date, 
                        TotalAmount, 
                        Status 
                    FROM Orders 
                    ORDER BY OrderDate DESC`
                );
                res.json({ success: true, orders: rows || [] });
            } catch (err) {
                console.error('Order Data DB Error:', err);
                res.status(500).json({ success: false, message: 'ไม่สามารถดึงข้อมูลใบสั่งซื้อ/ใบเสนอราคาได้: ' + err.message });
            }
        });

        // B.3 READ: Fetch a single order and its items (for editing)
        app.get('/api/input_order/:orderId', isAuthenticated, isAuthorized, async (req, res) => {
            const { orderId } = req.params;
            let connection;
            try {
                connection = await pool.getConnection();
                
                const [orderRows] = await connection.execute(
                    'SELECT OrderId, CustomerName, DATE_FORMAT(OrderDate, "%Y-%m-%d") as OrderDate, TotalAmount, Status FROM Orders WHERE OrderId = ?',
                    [orderId]
                );

                // สมมติว่ามีตาราง OrderItems
                const [itemRows] = await connection.execute(
                    'SELECT ItemId, ItemName, Quantity, Price, Subtotal, Description FROM OrderItems WHERE OrderId = ?',
                    [orderId]
                );

                if (orderRows.length === 0) {
                    return res.status(404).json({ success: false, message: 'ไม่พบใบสั่งซื้อ/ใบเสนอราคานี้' });
                }

                res.json({
                    success: true,
                    order: orderRows[0],
                    items: itemRows
                });

            } catch (err) {
                console.error(`Error fetching order ${orderId}:`, err);
                res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการดึงข้อมูล: ' + err.message });
            } finally {
                if (connection) connection.release();
            }
        });


        // B.4 CREATE/UPDATE: Insert or Update Order and Items (Transactional)
        // ในส่วน B.4 CREATE/UPDATE
        app.post('/api/input_order/save', isAuthenticated, isAuthorized, async (req, res) => {
            // ดึงข้อมูลตาม Key ที่ Frontend ส่งมา
            // ใช้ Default Parameter หรือการตรวจสอบค่า
            const { 
                jobId, 
                customerName, 
                items = [] // กำหนดค่าเริ่มต้นเป็น Array ว่าง
            } = req.body;

            console.log('xx');
            
            // คำนวณค่ารวมที่นี่ (Backend ควรคำนวณซ้ำเพื่อความปลอดภัย)
            const subtotal = items.reduce((sum, item) => sum + (item.pricePerUnit * (item.mungQuantity || item.curtainQuantity)), 0);
            const vatRate = 0.07;
            const totalAmount = subtotal * (1 + vatRate);
            
            // กำหนดค่าเริ่มต้น
            const currentOrderId = jobId || null; // ใช้ jobId เป็น OrderId
            const orderDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
            const status = 'Quotation'; // กำหนดสถานะเริ่มต้น
            
            let connection;
            
            if (!currentOrderId || !customerName || items.length === 0) {
                return res.status(400).json({ success: false, message: 'ข้อมูล Job ID, ชื่อลูกค้า, หรือรายการย่อยไม่สมบูรณ์' });
            }

            try {
                connection = await pool.getConnection();
                await connection.beginTransaction(); 

                // ----------------------------------------------------
                // 1. จัดการ Order หลัก (Orders Table)
                // ----------------------------------------------------
                // ตรวจสอบว่า Order นี้เคยมีอยู่แล้วหรือไม่
                const [existingOrder] = await connection.execute(
                    'SELECT OrderId FROM Orders WHERE OrderId = ?',
                    [currentOrderId]
                );
                
                if (existingOrder.length > 0) {
                    // UPDATE: OrderId มีอยู่แล้ว
                    await connection.execute(
                        'UPDATE Orders SET CustomerName = ?, OrderDate = ?, TotalAmount = ?, Status = ? WHERE OrderId = ?',
                        [customerName, orderDate, totalAmount, status, currentOrderId]
                    );
                    
                    // ลบ Items เก่าทั้งหมดก่อน
                    await connection.execute('DELETE FROM OrderItems WHERE OrderId = ?', [currentOrderId]);

                } else {
                    // CREATE: OrderId ยังไม่มีอยู่ (ให้สมมติว่า Frontend ส่ง OrderId มาเสมอ)
                    await connection.execute(
                        'INSERT INTO Orders (OrderId, CustomerName, OrderDate, TotalAmount, Status, CreatedByUserId) VALUES (?, ?, ?, ?, ?, ?)',
                        [currentOrderId, customerName, orderDate, totalAmount, status, req.user.UserId]
                    );
                }

                // ----------------------------------------------------
                // 2. บันทึก Order Items ใหม่ (OrderItems Table)
                // ----------------------------------------------------
                const itemPromises = items.map(item => {
                    // แปลงข้อมูลจาก Frontend (mung/curtain data) ให้เข้ากับตาราง OrderItems
                    const quantity = item.mungQuantity || item.curtainQuantity;
                    const pricePerUnit = item.pricePerUnit;
                    const subtotalItem = pricePerUnit * quantity;
                    
                    let itemName = item.productType;
                    let description = '';

                    if (item.productType === 'มุ้งลวด') {
                        description = `${item.mungType} ขนาด ${item.mungWidth}x${item.mungHeight} ซม. ที่ ${item.mungLocation}`;
                    } else if (item.productType === 'ผ้าม่าน') {
                        description = `${item.curtainType} รหัสสี ${item.curtainColorCode} ขนาด ${item.curtainWidth}x${item.curtainHeight} ซม. ที่ ${item.curtainLocation}`;
                    }

                    return connection.execute(
                        // ItemName, Quantity, Price, Subtotal, Description
                        'INSERT INTO OrderItems (OrderId, ItemName, Quantity, Price, Subtotal, Description) VALUES (?, ?, ?, ?, ?, ?)',
                        [currentOrderId, itemName, quantity, pricePerUnit, subtotalItem, description]
                    );
                });
                
                await Promise.all(itemPromises);

                await connection.commit(); 

                // **✅ เพิ่มโค้ดส่วนนี้เพื่อล้าง Session (สมมติว่าคุณเก็บข้อมูล Order ไว้ใน Session)**
                if (req.session.currentOrder) {
                    delete req.session.currentOrder;
                    console.log(`Session data for Order ${currentOrderId} cleared.`);
                }
                // *************************************************************************

                res.json({ success: true, message: 'บันทึกใบเสนอราคาสำเร็จ', jobId: currentOrderId });

            } catch (err) {
                console.error("Error saving order, rolling back:", err);
                if (connection) {
                    await connection.rollback(); 
                }
                res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการบันทึกข้อมูล (Transaction rolled back): ' + err.message });
            } finally {
                if (connection) connection.release();
            }
        });

        // B.5 DELETE: Delete existing Order (Transactional)
        app.post("/api/input_order/delete", isAuthenticated, isAuthorized, async (req, res) => {
            const { orderId } = req.body;
            let connection;

            if (!orderId) {
                return res.status(400).send({ message: 'Order ID is required for deletion.', success: false });
            }

            try {
                connection = await pool.getConnection();
                await connection.beginTransaction();

                // 1. ลบรายการย่อยก่อน (สำคัญมาก: Foreign Key Constraint)
                await connection.execute('DELETE FROM OrderItems WHERE OrderId = ?', [orderId]);
                
                // 2. ลบ Order หลัก
                const [result] = await connection.execute('DELETE FROM Orders WHERE OrderId = ?', [orderId]);

                await connection.commit();

                if (result.affectedRows === 0) {
                    return res.status(404).send({ message: `ไม่พบใบสั่งซื้อ/ใบเสนอราคา ID: ${orderId} ที่ต้องการลบ`, success: false });
                }

                res.status(200).send({ message: `ลบใบสั่งซื้อ/ใบเสนอราคา ID: ${orderId} สำเร็จ`, success: true, orderId: orderId });

            } catch (err) {
                console.error('Database deletion error (Order Transaction):', err);
                if (connection) {
                    await connection.rollback();
                }
                res.status(500).send({ message: 'เกิดข้อผิดพลาดในการลบข้อมูล (Transaction rolled back): ' + err.message, success: false });
            } finally {
                if (connection) connection.release();
            }
        });


        // Start the Express server ONLY after successful DB connection
        app.listen(port, () =>
            console.log(`Server listening on port: ${port}`)
        );

    } catch (err) {
        // ข้อผิดพลาดร้ายแรง: การเชื่อมต่อฐานข้อมูลล้มเหลว
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
            await pool.end(); // ใช้ pool.end() สำหรับ mysql2/promise
							  
            console.log('MariaDB Connection Pool closed.');
        } catch (err) {
            console.error('Error closing pool:', err);
        }
    }
    process.exit(0);
});