/**
 * NOTE: ในการใช้งานจริง, ไฟล์นี้ควรถูกโหลดหลังจากไฟล์ EJS ได้กำหนดตัวแปร 'liveJobs' 
 * (ซึ่งมาจากฐานข้อมูล) ใน Global Scope ให้กับ JavaScript แล้ว
 * * ตัวอย่าง: ใน schedule.ejs จะต้องมีโค้ดนี้ก่อนโหลด schedule.js
 * <script> const liveJobs = <%- JSON.stringify(jobs) %>; </script>
 */

// Global variable to hold the live data, declared in EJS, accessed here directly.
let jobsData = [];
// ตัวแปรสำหรับ DOM Elements (ประกาศไว้ด้านนอกเพื่อการเข้าถึงที่ง่าย)
let teamFilter;
let scheduleBody;
let upcomingJobsList;
let currentMonday; // กำหนดให้เป็น global เพื่อให้เข้าถึงได้ง่ายขึ้น

// ค่าคงที่ของตารางงาน
const timeSlots = ["09:00", "10:00", "11:00", "13:00", "14:00", "15:00", "16:00", "17:00"];
const daysOfWeek = ["จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์", "อาทิตย์"];

// ฟังก์ชันช่วยจัดรูปแบบวันที่เป็น YYYY-MM-DD
const formatDate = (date) => date.toISOString().split('T')[0];

// -------------------------------------------------------------------
// HELPER: ฟังก์ชันสร้าง Order ID ในรูปแบบ yyyymmddhhmmss
// -------------------------------------------------------------------
const generateOrderId = () => {
    const now = new Date();
    const pad = (num) => String(num).padStart(2, '0');
    
    const year = now.getFullYear();
    const month = pad(now.getMonth() + 1);
    const day = pad(now.getDate());
    const hour = pad(now.getHours());
    const minute = pad(now.getMinutes());
    const second = pad(now.getSeconds());
    
    return `${year}${month}${day}${hour}${minute}${second}`;
};

// -------------------------------------------------------------------
// Z. ฟังก์ชันแสดง Modal แจ้งเตือนความสำเร็จหรือล้มเหลว (แทน alert())
// -------------------------------------------------------------------
const showStatusModal = (title, message, isSuccess = true, onConfirm = null) => {
    // 1. สร้าง Modal Element
    const existingModal = document.getElementById('status-modal');
    if (existingModal) { existingModal.remove(); }
    
    const modal = document.createElement('div');
    modal.id = 'status-modal';
    modal.className = 'modal';
    
    const modalContent = document.createElement('div');
    modalContent.className = 'modal-content';
    // ปรับสี Modal ตามสถานะ (สำเร็จ/ผิดพลาด)
    modalContent.style.backgroundColor = isSuccess ? '#e6ffe6' : '#ffe6e6';
    modalContent.style.border = isSuccess ? '1px solid #00a000' : '1px solid #a00000';

    modalContent.innerHTML = `
        <span class="close-btn">&times;</span>
        <h3 style="color: ${isSuccess ? '#007000' : '#700000'};">${title}</h3>
        <p>${message}</p>
        <button id="modal-ok-btn" class="nav-btn" style="background-color: ${isSuccess ? '#4CAF50' : '#f44336'}; color: white; margin-top: 15px;">OK</button>
    `;

    modal.appendChild(modalContent);
    document.body.appendChild(modal);
    modal.style.display = 'block';

    // 2. Event Listeners
    const closeModal = () => {
        modal.remove();
        // เรียก Callback (ถ้ามี) เมื่อผู้ใช้กด OK
        if (onConfirm) {
            onConfirm();
        }
    };

    modalContent.querySelector('.close-btn').addEventListener('click', closeModal);
    document.getElementById('modal-ok-btn').addEventListener('click', closeModal);

    // ปิด Modal เมื่อคลิกนอกพื้นที่
    window.onclick = function(event) {
        if (event.target == modal) {
            closeModal();
        }
    }
};

// -------------------------------------------------------------------
// A. ฟังก์ชันแสดงงานที่กำลังจะมาถึง (Upcoming Jobs Sidebar) - ย้ายมา Global Scope
// -------------------------------------------------------------------
const renderUpcomingJobs = (filterValue = 'all') => {
    upcomingJobsList.innerHTML = ''; 

    // 1. กรองงานที่ยังไม่เสร็จ (ไม่รวมสถานะ 'completed') และที่กำลังจะมา
    let upcomingJobs = jobsData.filter(job => job.status !== 'completed' && job.date >= formatDate(new Date()));

    // 2. กรองตามทีมช่าง (ถ้ามีการเลือก)
    if (filterValue !== 'all') {
        upcomingJobs = upcomingJobs.filter(job => job.team === filterValue);
    }

    // 3. จัดเรียงตามวันที่และเวลา
    upcomingJobs.sort((a, b) => {
        if (a.date !== b.date) {
            return a.date.localeCompare(b.date);
        }
        return a.time.localeCompare(b.time);
    });
    
    // จำกัดการแสดงผลไม่เกิน 5 งานที่กำลังจะมาถึง
    upcomingJobs = upcomingJobs.slice(0, 5);


    if (upcomingJobs.length === 0) {
        upcomingJobsList.innerHTML = '<p class="no-jobs-msg">ไม่มีงานติดตั้งที่ค้างอยู่ในขณะนี้ 🎉</p>';
        return;
    }

    // 4. สร้างรายการงาน
    upcomingJobs.forEach(job => {
        const jobItem = document.createElement('div');
        const statusClass = `status-${job.status}`;
        
        jobItem.className = `upcoming-job-item ${statusClass}`;
        jobItem.innerHTML = `
            <strong>#${job.id} - ${job.customer}</strong>
            <span class="date-info">${job.date} | ${job.time} | ทีม ${job.team ? job.team.toUpperCase() : 'N/A'}</span>
            <span class="date-info status-text job-type-text">${job.jobType} | สถานะ: ${job.status.toUpperCase()}</span>
        `;
        upcomingJobsList.appendChild(jobItem);
    });
};

// -------------------------------------------------------------------
// B. ฟังก์ชันสร้างตารางปฏิทินหลัก (Schedule Table) - ย้ายมา Global Scope
// -------------------------------------------------------------------
const renderSchedule = (startDate, filterValue = 'all') => {
    scheduleBody.innerHTML = ''; 
    
    // คำนวณวันที่ของแต่ละวันในสัปดาห์
    const weekDates = daysOfWeek.map((_, index) => {
        const date = new Date(startDate);
        date.setDate(startDate.getDate() + index);
        return date;
    });

    // อัปเดตช่วงวันที่แสดงใน Header
    const startDay = weekDates[0].toLocaleDateString('th-TH', { day: '2-digit', month: 'short' });
    const endDay = weekDates[6].toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' });
    document.getElementById('current-week-range').textContent = `${startDay} - ${endDay}`;
    
    // 1. อัปเดต Header ของตารางให้ตรงกับวันที่จริง
    const headerCells = scheduleBody.parentElement.querySelector('thead tr').children;
    weekDates.forEach((date, index) => {
        // Skip the first cell (Time)
        if (index + 1 < headerCells.length) {
             headerCells[index + 1].textContent = `${daysOfWeek[index]} ${date.getDate()}/${date.getMonth() + 1}`; 
        }
    });

    // 2. สร้างแถวของแต่ละช่วงเวลา
    timeSlots.forEach(time => {
        const row = scheduleBody.insertRow();
        
        // คอลัมน์แรกคือช่วงเวลา
        const timeCell = row.insertCell();
        timeCell.textContent = time;

        // สร้างเซลล์สำหรับแต่ละวันในสัปดาห์
        weekDates.forEach(date => {
            const dateString = formatDate(date);
            const dayCell = row.insertCell();

            // กรองหางานที่ตรงกับ วันที่ และ ช่วงเวลา (ใช้ jobsData จริง)
            const jobsInSlot = jobsData.filter(job => 
                job.date === dateString && 
                job.time === time && 
                (filterValue === 'all' || job.team === filterValue)
            );
            
            jobsInSlot.forEach(job => {
                const jobDiv = document.createElement('div');
                const statusClass = `status-${job.status}`;
                
                jobDiv.className = `job-card ${statusClass} job-team-${job.team}`;
                jobDiv.innerHTML = `
                    <strong>${job.customer} - ${job.jobType}</strong>
                    ${job.customer} (${job.team ? job.team.toUpperCase() : 'N/A'})
                `;
                jobDiv.title = `คลิกเพื่อดูรายละเอียดงาน #${job.id}`;
                dayCell.appendChild(jobDiv);
            });
        });
    });
    
    // เรียกใช้ฟังก์ชันแสดงงานที่กำลังจะมาถึง
    renderUpcomingJobs(filterValue); 
};


// -------------------------------------------------------------------
// X. ฟังก์ชันดึงข้อมูลใหม่จาก Server และ Refresh UI - (ใช้ renderSchedule ได้แล้ว)
// -------------------------------------------------------------------
const reloadDataAndRefreshView = async (currentMonday, teamFilterValue) => {
    try {
        console.log("Fetching updated schedule data...");
        // เรียก Route ที่สร้างขึ้นใหม่เพื่อดึงข้อมูล JSON เท่านั้น
        const response = await fetch('/schedule/data'); 
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.error) {
            throw new Error(data.error);
        }

        // อัปเดต Global jobsData ด้วยข้อมูลใหม่ที่ถูกดึงมา
        jobsData = Array.isArray(data.jobs) ? data.jobs : [];
        console.log("Data refreshed successfully. New jobs count:", jobsData.length);
        
        // Refresh การแสดงผลตารางหลักและแถบด้านข้าง
        renderSchedule(currentMonday, teamFilterValue);

    } catch (error) {
        console.error("Error refreshing data:", error);
        showStatusModal('เกิดข้อผิดพลาดในการดึงข้อมูล', `ไม่สามารถอัปเดตข้อมูลตารางได้: ${error.message}`, false);
    }
}


// -------------------------------------------------------------------
// C. ฟังก์ชันจัดการ Modal (Popup) 
// -------------------------------------------------------------------
const createModal = (content, afterLoadedCallback = null) => {
    const existingModal = document.getElementById('form-modal');
    if (existingModal) { existingModal.remove(); }
    
    const modal = document.createElement('div');
    modal.id = 'form-modal';
    modal.className = 'modal';
    
    const modalContent = document.createElement('div');
    modalContent.className = 'modal-content';
    
    modalContent.innerHTML = content; 

    modal.appendChild(modalContent);
    document.body.appendChild(modal);
    
    modal.style.display = 'block';

    // Setup Close Button (cancel-btn) inside the Modal Content
    const closeBtnInModal = modalContent.querySelector('.cancel-btn'); 
    if (closeBtnInModal) {
        closeBtnInModal.addEventListener('click', () => modal.remove());
    }

    // ปิด Modal เมื่อคลิกนอกพื้นที่
    window.onclick = function(event) {
        if (event.target == modal) {
            modal.remove();
        }
    }
    
    // เรียกใช้ Callback หลังจาก Modal ถูกสร้างและเนื้อหาถูกแทรก
    if (afterLoadedCallback) {
        afterLoadedCallback(modalContent);
    }
};

// -------------------------------------------------------------------
// E. ฟังก์ชันจัดการ Submit ฟอร์มงานใหม่ (Job Submission)
// -------------------------------------------------------------------
const handleSubmitNewJob = (form, modal) => {
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const formData = new FormData(form);
        // แปลง FormData เป็น JSON Object เพื่อส่งไป Server
        const data = Object.fromEntries(formData.entries());
        
        try {
            const response = await fetch('/schedule/new', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const result = await response.json();
            
            // ปิด Modal ฟอร์ม
            modal.remove();

									   

            if (result.success) {
                // แสดง Modal สำเร็จ
                showStatusModal(
                    'บันทึกข้อมูลสำเร็จ!', 
                    'งานติดตั้งใหม่ถูกบันทึกเรียบร้อยแล้ว ระบบกำลังอัปเดตตาราง...', 
                    true, 
                    // Callback เมื่อกด OK: ดึงข้อมูลใหม่และ Refresh UI
                    // ใช้ currentMonday และ teamFilter.value ซึ่งเป็น Global/Semi-Global
                    () => reloadDataAndRefreshView(currentMonday, teamFilter.value)
                );
            } else {
                // ถ้า Server ตอบกลับมาว่าไม่สำเร็จ แต่ HTTP status เป็น 200
                throw new Error(result.message || 'Server returned failure.');
            }
            
        } catch (error) {
            console.error("Error submitting new job:", error);
            // แสดง Modal ข้อผิดพลาด
            showStatusModal('เกิดข้อผิดพลาดในการบันทึก', `ไม่สามารถบันทึกงานได้: ${error.message}`, false);
        }
    });
};


document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialize Global Data and DOM Elements
    jobsData = Array.isArray(liveJobs) ? liveJobs : [];
    console.log("Loaded Jobs from Database:", jobsData);

																  
    scheduleBody = document.getElementById('schedule-body');
    upcomingJobsList = document.getElementById('upcoming-jobs-list');
    teamFilter = document.getElementById('team-filter'); // กำหนดค่าให้ตัวแปร Global teamFilter
    const addBtn = document.querySelector('.add-btn'); 
    
    // 2. Calculate initial currentMonday (MOVED from inside the old renderSchedule)
																							   
																																											
	
																																																			 
    currentMonday = new Date(); 
																							  
    currentMonday.setDate(currentMonday.getDate() - (currentMonday.getDay() + 6) % 7);

    // 3. Setup Event Listeners
    
																											   
																  

																		  
																															
																		  
														 
										 

																																										   
																													

																								  
									
																				
		 

																					  
									 
									
													
			 
												
		   
		
																																   
												


										
																																												  
				   
		 

														
									 
														  
													   
			
																   
								 
															 
																																 
																																	  
			  
												  
		   
	  

																		  
																											   
																		  
																
									 
		
																										
														
											 
													  
						
		   

																					
																									  
																													 
																							  
		
																														 
																						  
											
										 
												 
																													   
			 
		   

																					  
								   
												 
			
																			  
											  
										

																												  
									   
													
												 

																																								 
														  
											   
										 
																	   
				  
				
										   
																 
															   
					
																					  
										
																	
																					  
					  
																														 
												
				   
			   
		   
		
																															 
										 
	  

																		  
																				  
																		  

    // ควบคุมการเปลี่ยนสัปดาห์
    document.getElementById('prev-week-btn').addEventListener('click', () => {
        currentMonday.setDate(currentMonday.getDate() - 7);
        renderSchedule(currentMonday, teamFilter.value);
    });

    document.getElementById('next-week-btn').addEventListener('click', () => {
        currentMonday.setDate(currentMonday.getDate() + 7);
        renderSchedule(currentMonday, teamFilter.value);
    });

    // ควบคุมการกรองตามทีมช่าง (มีผลต่อทั้งตารางและแถบด้านข้าง)
    teamFilter.addEventListener('change', (e) => {
        renderSchedule(currentMonday, e.target.value);
    });
    
    // Event Listener สำหรับปุ่ม "เพิ่มงานใหม่" (เรียก Partial View)
    if (addBtn) {
        addBtn.addEventListener('click', async () => {
            const url = '/schedule/input'; 
            
            try {
                const response = await fetch(url);
                
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                
                const htmlContent = await response.text();
                
                // ใช้ createModal พร้อม Callback เพื่อจัดการ Submit ฟอร์ม
                createModal(htmlContent, (modalContent) => {
                    const form = modalContent.querySelector('#new-job-form');
                    const orderIdInput = modalContent.querySelector('#orderId');
                    const formModal = document.getElementById('form-modal');
                    
                    if (form && formModal) {
                        // *** กำหนดค่า Order ID ที่สร้างขึ้นโดยอัตโนมัติ ***
                        if (orderIdInput) {
                            orderIdInput.value = generateOrderId();
                        }

                        // ไม่ต้องส่ง currentMonday และ teamFilter.value เข้าไปใน handleSubmitNewJob อีก เพราะมันสามารถเข้าถึงตัวแปร Global ได้โดยตรง
                        handleSubmitNewJob(form, formModal);
                    }
                });

            } catch (error) {
                console.error("Error loading partial view:", error);
                // แสดง Modal ข้อผิดพลาดแทน alert()
                showStatusModal('ไม่สามารถโหลดฟอร์มได้', 'กรุณาตรวจสอบการเชื่อมต่อเซิร์ฟเวอร์หรือ Route /schedule/input', false);
            }
        });
    }


    // 4. แสดงผลเริ่มต้น
    renderSchedule(currentMonday, teamFilter.value); 
});