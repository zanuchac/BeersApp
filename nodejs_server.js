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

// -------------------------------------------------------------------
// 1. ENDPOINT: แสดงหน้าหลักตารางนัดหมาย (/schedule) - แก้ไขให้ดึงข้อมูล
// -------------------------------------------------------------------
app.get("/schedule", async (req,res) => { // <--- ต้องมี 'async' เพื่อใช้ 'await' ด้านใน
    try {
        // *** ใช้ 'await' เพื่อรอผลลัพธ์จากการ Query จากฐานข้อมูล ***
        const result = await pool.request().query( 
            `SELECT 
                orderid as id, 
                CustomerName as customer, 
                Team as team, 
                Status as status, 
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
            dbError: null // ส่งค่า null เมื่อไม่มี error
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
// 2. ENDPOINT: แสดงหน้าเว็บย่อย (Partial View) สำหรับเพิ่มงานใหม่ (/schedule/input)
// -------------------------------------------------------------------
app.get("/schedule/input", (req, res) => {
    res.render('input_schedule');
})

// -------------------------------------------------------------------
// 3. ENDPOINT: รับข้อมูล POST จากฟอร์มเพิ่มงานใหม่ (/schedule/new)
// -------------------------------------------------------------------
app.post("/schedule/new", (req, res) => {
    // ข้อมูลที่ส่งมาจากฟอร์ม (Form Data) จะอยู่ใน req.body
    const newJobData = req.body;    
    // แสดงข้อมูลที่ได้รับ
																																																  
    console.log("Received new job data:", newJobData);
    // ********** โค้ดส่วนนี้คือตัวอย่างการบันทึกข้อมูล **********    
    // ตัวอย่างการใช้ mssql หรือ tedious เพื่อบันทึกข้อมูลจริง
    sql.connect(config).then(pool => {
        return pool.request()
            .input('orderId', sql.NVarChar, newJobData.orderId)
            .input('customerName', sql.NVarChar, newJobData.customerName)
            .input('address', sql.NVarChar, newJobData.address)
            .input('appointmentDate', sql.Date, newJobData.appointmentDate)
            .input('appointmentTime', sql.NVarChar, newJobData.appointmentTime)
            .input('jobType', sql.NVarChar, newJobData.jobType)
            .input('team', sql.NVarChar, newJobData.team)
            .input('status', sql.NVarChar, "initial")
            // เพิ่ม input อื่นๆ ตามที่ต้องการ
            .query('INSERT INTO [Schedule] (OrderId, CustomerName, Address, AppointmentDate, AppointmentTime, JobType, Team, Status) VALUES (@orderId, @customerName, @address, @appointmentDate, @appointmentTime, @jobType, @team, @status)');
        console.log(sql.query)
    }).then(result => {
        console.log('Job saved successfully.');
        res.status(201).send({ message: 'บันทึกงานใหม่สำเร็จ' });
    }).catch(err => {
        console.error('Database insertion error:', err);
        res.status(500).send({ message: 'เกิดข้อผิดพลาดในการบันทึกข้อมูล' });
    });

    res.render('schedule')
    // ตอบกลับทันทีเพื่อยืนยันการรับข้อมูล (สำหรับ Demo)
    //res.status(200).send({ message: `Received job for ${newJobData.customerName} on ${newJobData.appointmentDate}` });
})


// ********** ส่วนโค้ดเดิมของคุณ (GET/POST/PUT/DELETE) ถูกละไว้เพื่อความกระชับ **********


app.listen(port, () =>
    console.log("Listen on port : ?", port)
)