//Open Call Express
const express = require('express')
const path = require('path'); // Required for path.join
const app = express()
const sql = require('mssql'); // Import mssql module
const port = process.env.PORT || 3000;
const bodyParser = require('body-parser')

// view
app.set('view engine', 'ejs')
app.use(express.static('public'))
app.use(bodyParser.urlencoded({extended: false}))
app.use(bodyParser.json())

const Connection = require('tedious').Connection;  

// SQL Server (MSSQL) Configuration
const config = {  
    server: 'beerdemoappserver.database.windows.net',  //update me
    authentication: {
        type: 'default',
        options: {
        userName: 'sadmin', //update me
        password: 'BeerDemoApp!'  //update me
        }
    },
    options: {
        encrypt: true, // If you are on Microsoft Azure, you need encryption
        database: 'beerdemoapp',  //update me
        trustServerCertificate: true // Recommended for development on local machine
    }
};  

// สร้าง Connection Pool ทันทีที่เริ่มต้นแอป
const pool = new sql.ConnectionPool(config);
pool.connect(err => {
    if (err) {
        console.error('Database Connection Pool Creation Failed:', err);
    } else {
        console.log('Database Connection Pool Created Successfully');
    }
});

var obj = {} // Global Variable

app.get("/", async (req,res) => {
    res.render('Index')
})

// -------------------------------------------------------------------
// 1. ENDPOINT: แสดงหน้าหลักตารางนัดหมาย (/schedule) - อัปเดต SELECT
// -------------------------------------------------------------------
app.get("/schedule", async (req,res) => { 
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
        
        console.log('load data from database completed')

        // ส่งข้อมูลที่ดึงมา (recordset) ไปยังหน้า EJS
        res.render('schedule', { 
            jobs: result.recordset || [],
            dbError: null 
        });

    } catch (err) {
        console.error('Database Query Error:', err);
        // กรณี Query ล้มเหลว ส่งหน้า schedule พร้อม error message ไป
        res.render('schedule', { 
            jobs: [], 
            dbError: 'ไม่สามารถดึงข้อมูลตารางงานได้ กรุณาตรวจสอบการเชื่อมต่อฐานข้อมูล: ' + err.message
        });
    }
});

// -------------------------------------------------------------------
// 1.1 ENDPOINT: ดึงข้อมูลแบบ JSON สำหรับ Client-side Refresh - อัปเดต SELECT
// -------------------------------------------------------------------
app.get('/schedule/data', async(req, res) => {
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
        
        console.log('load data from database completed')

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

// -------------------------------------------------------------------
// 2. ENDPOINT: แสดงหน้าเว็บย่อย (Partial View) สำหรับเพิ่มงานใหม่ (/schedule/input)
// -------------------------------------------------------------------
app.get("/schedule/input", (req, res) => {
    console.log('testt')
    res.render('input_schedule');
})

// -------------------------------------------------------------------
// 3. ENDPOINT: รับข้อมูล POST จากฟอร์มเพิ่มงานใหม่ (/schedule/new) - อัปเดต INSERT
// -------------------------------------------------------------------
app.post("/schedule/new", (req, res) => {
    const newJobData = req.body;    
    
    console.log("Received new job data:", newJobData);
    
    // ตรวจสอบข้อมูลเบื้องต้น
    if (!newJobData.orderId || !newJobData.customerName) {
         return res.status(400).send({ message: 'กรุณากรอก Order ID และชื่อลูกค้าให้ครบถ้วน', success: false });
    }

    sql.connect(config).then(pool => {
        return pool.request()
            .input('orderId', sql.NVarChar, newJobData.orderId)
            .input('customerName', sql.NVarChar, newJobData.customerName)
            .input('address', sql.NVarChar, newJobData.address) // NEW: เพิ่ม address
            .input('appointmentDate', sql.Date, newJobData.appointmentDate)
            .input('appointmentTime', sql.NVarChar, newJobData.appointmentTime)
            .input('jobType', sql.NVarChar, newJobData.jobType)
            .input('team', sql.NVarChar, newJobData.team)
            .input('status', sql.NVarChar, newJobData.status || 'scheduled') // NEW: ใช้ status จาก client หรือ default เป็น 'scheduled'
            
            .query('INSERT INTO [Schedule] (OrderId, CustomerName, Address, AppointmentDate, AppointmentTime, JobType, Team, Status) VALUES (@orderId, @customerName, @address, @appointmentDate, @appointmentTime, @jobType, @team, @status)');
    }).then(result => {
        console.log('Job saved successfully.');
        res.status(201).send({ message: 'บันทึกงานใหม่สำเร็จ', success: true, jobId: newJobData.orderId });
    }).catch(err => {
        console.error('Database insertion error:', err);
        res.status(500).send({ message: 'เกิดข้อผิดพลาดในการบันทึกข้อมูล: ' + err.message, success: false });
    });
})


// -------------------------------------------------------------------
// 4. ENDPOINT: รับข้อมูล POST จากฟอร์มแก้ไขงาน (/schedule/update) - NEW
// -------------------------------------------------------------------
app.post("/schedule/update", async (req, res) => {
    const updatedJobData = req.body;
    console.log("Received job update data:", updatedJobData);

    // OrderId คือ field ที่ใช้เป็น Primary Key ใน DB
    const orderId = updatedJobData.orderId || updatedJobData.id; 

    if (!orderId) {
        return res.status(400).send({ message: 'Order ID is required for update.', success: false });
    }

    try {
        const pool = await sql.connect(config);
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
        
        // rowsAffected[0] จะบอกจำนวนแถวที่ได้รับผลกระทบ
        if (result.rowsAffected[0] === 0) {
            return res.status(404).send({ message: `No job found with Order ID: ${orderId}`, success: false });
        }

        console.log(`Job with Order ID ${orderId} updated successfully.`);
        res.status(200).send({ message: 'บันทึกการแก้ไขงานสำเร็จ', success: true, jobId: orderId });

    } catch (err) {
        console.error('Database update error:', err);
        res.status(500).send({ message: 'เกิดข้อผิดพลาดในการแก้ไขข้อมูล: ' + err.message, success: false });
    }
});
// ********** ส่วนโค้ดเดิมของคุณ (GET/POST/PUT/DELETE) ถูกละไว้เพื่อความกระชับ **********


app.listen(port, () =>
    console.log("Listen on port : ?", port)
)