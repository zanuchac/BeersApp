//Open Call Express
const express = require('express')
const sql = require('mssql');

const app = express()
const port = process.env.PORT || 3000;
// view
app.set('view engine', 'ejs')

//const bodyParser = require('body-parser')
//const mysql = require('mysql');
// ใช้คำสั่ง bodyParser.urlencoded ที่ให้สามารถรับข้อมูล x-www-form-urlencoded
//app.use(bodyParser.urlencoded({extended: false}))
//app.use(bodyParser.json())

//MySQL Connect phpMyAdmin
/*
const pool = mysql.createPool({
    connectionLimit : 10,
    connectTimeout : 20,
    host : 'localhost', // www.google.com/sql or Server IP Adress
    user: 'root',
    password : '',
    database : 'nodejs_beers' // Connect Database from bears.sql (Import to phpMyAdmin)
})*/

 var Connection = require('tedious').Connection;  

 var config = {  
    server: 'beerdemoappserver.database.windows.net',  //update me
    authentication: {
        type: 'default',
        options: {
        userName: 'sadmin', //update me
        password: 'BeerDemoApp!'  //update me
        }
    },
    options: {
        // If you are on Microsoft Azure, you need encryption:
        encrypt: true,
        database: 'beerdemoapp'  //update me
    }
};  

var obj = {} // Global Variable

//Back-End NodeJS Display
app.get("/hello",(req,res) => {

    var connection = new Connection(config);  
    connection.connect(function(err){
        if(err) throw err

        console.log('Connected Successfully')
        res.send("Hello แผ่นดิน ธารธารา บ้านสวน และชาวโลก!")
    });

    //res.send("Hello NodseJS!")
})

/*
//GET ()
app.get('', (req,res) => {
    pool.getConnection((error, connection) => { //err คือ connect ไม่ได้ or connection คือ connect ได้
        if(error) throw err
        console.log("connected id : ?", connection.threadId) // ให้ print บอกว่า connect ได้ไหม

        connection.query("select * from beers", (err, rows) => {
            connection.release();
            if(!err){ // แสดงค่าตัวแปร rows
              //  res.json(rows)
                //res.send(rows)
                //console.log(rows)

                //ทำการ package ข้อมูลที่จะทำการส่ง

                // ---- Model ----
                obj = { beers : rows, Error : error}

                // ---- Controller ----
                res.render('index', obj)
            }
            else{
                console.log(err)
            }
        })
    })
})

//สร้างหน้าย่อย ดึงข้อมูลเฉพาะ id ที่ต้องการ
app.get('/:id', (req,res) => {
    pool.getConnection((error, connection) => { //err คือ connect ไม่ได้ or connection คือ connect ได้
        if(error) throw err
        console.log("connected id : ?", connection.threadId) // ให้ print บอกว่า connect ได้ไหม

        connection.query("select * from beers where `id` = ?", req.params.id, (err, rows) => {
            connection.release();
            if(!err){ // แสดงค่าตัวแปร rows
                res.json(rows)
                //res.send(rows)
                //console.log(rows)
            }
            else{
                console.log(err)
            }
        })
    })
})

//Add New GET เปลี่ยน Path ใส่ตัวแปรไป 2 ตัวคือ name, id
app.get('/getname_id/:name&:id', (req,res) => {
    pool.getConnection((error, connection) => { //err คือ connect ไม่ได้ or connection คือ connect ได้
        if(error) throw err
        console.log("connected id : ?", connection.threadId) // ให้ print บอกว่า connect ได้ไหม

        connection.query("select * from beers where `id` = ? or `name` like ?", [req.params.id, req.params.name], (err, rows) => {
            connection.release();
            if(!err){ // แสดงค่าตัวแปร rows
                res.json(rows)
                //res.send(rows)
                //console.log(rows)
            }
            else{
                console.log(err)
            }
        })
    })
})

//(1)POST --> INSERT
//สร้าง Path ของเว็บไซต์ additem
app.post('/additem/', (req,res) => {
    pool.getConnection((err, connection) => {
        if(err) throw err
        const params = req.body
            //Check duplicate
            pool.getConnection((err, connection2) => {
                connection2.query("SELECT COUNT(id) as count FROM beers WHERE id = ?", params.id, (err, rows) => {
                    connection2.release()
                    if(!rows[0].count){
                        connection.query("INSERT INTO beers SET ?", params, (err, rows) =>{
                            connection.release()
                            if(!err){
                                res.send(`${params.name} is complete adding item.`)
                            } else {
                                console.log(err)
                            }
                        })
                    }
                    else{
                        res.send(`${params.name} do not insert data`)
                    }
                })
            })
    })
})

//(2)DELETE
app.delete('/delete/:id', (req,res) => {
    pool.getConnection((err, connection) => {
        if(err) {
            throw err
        }
        console.log("connection id : ?", connection.threadId)
        //ลบข้อมูล
        connection.query("DELETE FROM `beers` where `beers`.`id` = ?", [req.params.id], (err, rows) => {
            connection.release()
            if(!err){
                    res.send(`${req.params.id} is complete deleting item.`)
                } else {
                    console.log(err)
                }
        })
    })
})

//(3)PUT update data
app.put('/update', (req,res) => {
    pool.getConnection((error, connection) => {
        console.log("connected id = ?", connection.threadId)
        
        // สร้างตัวแปร นิยมสร้างเป็น const
        const {id, name, tagline, description, img} = req.body

        //update ข้อมูลตามลำดับโดยใช้เงื่อนไข id ในการอัพเดท
        connection.query("UPDATE beers SET name = ?, tagline = ?, description = ?, image = ? WHERE id = ?", [name, tagline, description, img, id], (err, rows) => {
            connection.release()
            if(!err){
                res.send(` ${name} is complete update item.`)
            } else{
                console.log(err)
            }
        })
    })
})

//UPDATE `beers` SET `name` = 'new Chang' WHERE `beers`.`id` = 123;
*/
app.listen(port, () =>
    console.log("isten on port : ?", port)
)