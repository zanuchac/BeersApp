// Import required modules
const express = require('express')
const path = require('path');
const app = express()
const sql = require('mssql'); 
const port = process.env.PORT || 3000;
const bodyParser = require('body-parser')

// View setup (EJS)
app.set('view engine', 'ejs')
app.use(express.static('public'))
app.use(bodyParser.urlencoded({extended: false}))
app.use(bodyParser.json())

// SQL Server (MSSQL) Configuration
const config = {
    server: 'beerdemoappserver.database.windows.net',    // Update your server
    authentication: {
        type: 'default',
        options: {
        userName: 'sadmin', // Update your username
        password: 'BeerDemoApp!'    // Update your password
        }
    },
    options: {
        encrypt: true, // Required for Azure/Cloud deployment
        database: 'beerdemoapp',    // Update your database name
        trustServerCertificate: true // Recommended for development
    }
};

// Initialize Connection Pool
const pool = new sql.ConnectionPool(config);
pool.connect(err => {
    if (err) {
        console.error('Database Connection Pool Creation Failed:', err);
    } else {
        console.log('Database Connection Pool Created Successfully');
    }
});

// Root Endpoint
app.get("/", async (req,res) => {
    res.render('Index')
})

// -------------------------------------------------------------------
// 1. READ: Display schedule table (/schedule)
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
        
        console.log('load data from database completed');

        res.render('schedule', { 
            jobs: result.recordset || [],
            dbError: null 
        });

    } catch (err) {
        console.error('Database Query Error:', err);
        res.render('schedule', { 
            jobs: [], 
            dbError: 'ไม่สามารถดึงข้อมูลตารางงานได้ กรุณาตรวจสอบการเชื่อมต่อฐานข้อมูล: ' + err.message
        });
    }
});

// -------------------------------------------------------------------
// 1.1 READ: JSON data for client-side refresh
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
// 2. VIEW: Display input form
// -------------------------------------------------------------------
app.get("/schedule/input", (req, res) => {
    res.render('input_schedule');
})

// -------------------------------------------------------------------
// 3. CREATE: Insert new job (/schedule/new)
// -------------------------------------------------------------------
app.post("/schedule/new", async (req, res) => {
    const newJobData = req.body;     
    
    console.log("Received new job data:", newJobData);
    
    if (!newJobData.orderId || !newJobData.customerName) {
        return res.status(400).send({ message: 'กรุณากรอก Order ID และชื่อลูกค้าให้ครบถ้วน', success: false });
    }

    try {
        await pool.request() // Use Connection Pool
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
})


// -------------------------------------------------------------------
// 4. UPDATE: Update existing job (/schedule/update)
// -------------------------------------------------------------------
app.post("/schedule/update", async (req, res) => {
    const updatedJobData = req.body;
    console.log("Received job update data:", updatedJobData);

    const orderId = updatedJobData.orderId || updatedJobData.id; 

    if (!orderId) {
        return res.status(400).send({ message: 'Order ID is required for update.', success: false });
    }

    try {
        const result = await pool.request() // Use Connection Pool
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

        console.log(`Job with Order ID ${orderId} updated successfully.`);
        res.status(200).send({ message: 'บันทึกการแก้ไขงานสำเร็จ', success: true, jobId: orderId });

    } catch (err) {
        console.error('Database update error:', err);
        res.status(500).send({ message: 'เกิดข้อผิดพลาดในการแก้ไขข้อมูล: ' + err.message, success: false });
    }
});

// -------------------------------------------------------------------
// 5. DELETE: Delete existing job (/schedule/delete)
// -------------------------------------------------------------------
app.post("/schedule/delete", async (req, res) => {
    // Get OrderId from the request body
    const { orderId } = req.body;
    console.log("Received job deletion request for Order ID:", orderId);

    if (!orderId) {
        return res.status(400).send({ message: 'Order ID is required for deletion.', success: false });
    }

    try {
        const result = await pool.request() // Use Connection Pool
            .input('orderId', sql.NVarChar, orderId)
            .query(`DELETE FROM [Schedule] WHERE OrderId = @orderId`);
        
        if (result.rowsAffected[0] === 0) {
            return res.status(404).send({ message: `ไม่พบงาน Order ID: ${orderId} ที่ต้องการลบ`, success: false });
        }

        console.log(`Job with Order ID ${orderId} deleted successfully.`);
        res.status(200).send({ message: `ลบงาน Order ID: ${orderId} สำเร็จ`, success: true, jobId: orderId });

    } catch (err) {
        console.error('Database deletion error:', err);
        res.status(500).send({ message: 'เกิดข้อผิดพลาดในการลบข้อมูล: ' + err.message, success: false });
    }
});


app.listen(port, () =>
    console.log("Listen on port : ?", port)
)