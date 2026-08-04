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
// ตัวแปรสำหรับ Modal ที่เปิดอยู่
let currentModal;

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
// HELPER: ฟังก์ชันคำนวณวันที่ทั้ง 7 วันในสัปดาห์ (เริ่มต้นจาก startDate)
// *** แก้ไข: ปรับโครงสร้างเล็กน้อยเพื่อให้มั่นใจว่า Date Object ถูกสร้างใหม่และคำนวณวันที่ถูกต้อง ***
// -------------------------------------------------------------------
const getWeekDates = (startDate) => {
    const weekDates = [];
    for (let i = 0; i < 7; i++) {
        // สร้าง Date Object ใหม่จากวันที่เริ่มต้น (วันจันทร์)
        const date = new Date(startDate); 
        // คำนวณวันที่ของวันถัดๆ ไปในสัปดาห์
        date.setDate(startDate.getDate() + i); 
        weekDates.push(date);
    }
    return weekDates;
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
    const bgColor = isSuccess ? '#e6ffe6' : '#ffe6e6';
    const borderColor = isSuccess ? '#00a000' : '#a00000';
    const titleColor = isSuccess ? '#007000' : '#700000';
    const buttonBgColor = isSuccess ? '#4CAF50' : '#f44336';


    modalContent.style.backgroundColor = bgColor;
    modalContent.style.border = `1px solid ${borderColor}`;

    modalContent.innerHTML = `
        <span class="close-btn">&times;</span>
        <h3 style="color: ${titleColor};">${title}</h3>
        <p>${message}</p>
        <button id="modal-ok-btn" class="nav-btn" style="background-color: ${buttonBgColor}; color: white; margin-top: 15px;">OK</button>
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
            <span class="date-info">${job.date} | ${String(job.time).substring(0, 5)} | ทีม ${job.team ? job.team.toUpperCase() : 'N/A'}</span>
            <span class="date-info status-text job-type-text">${job.jobType} | สถานะ: ${job.status.toUpperCase()}</span>
        `;
        upcomingJobsList.appendChild(jobItem);

        // เพิ่ม Listener สำหรับเปิด Modal ในโหมดแก้ไขจาก Sidebar
        jobItem.addEventListener('click', () => {
            openJobModal('edit', job);
        });
    });
};

// -------------------------------------------------------------------
// B. ฟังก์ชันสร้างตารางปฏิทินหลัก (Schedule Table)
// *** แก้ไข: ปรับการกรองงานใน job.time ให้ใช้เพียง HH:MM ***
// -------------------------------------------------------------------
const renderSchedule = (startDate, filterValue = 'all') => {
    scheduleBody.innerHTML = ''; 
    
    // คำนวณวันที่ของแต่ละวันในสัปดาห์โดยใช้ Helper Function
    const weekDates = getWeekDates(startDate); 
    
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
            const jobsInSlot = jobsData.filter(job => {
                
                // 1. ตัดส่วนเวลาจากฐานข้อมูลให้เหลือ HH:MM (09:00:00 -> 09:00)
                const jobTimeHHMM = job.time ? String(job.time).substring(0, 5) : '';
                
                return (
                    job.date === dateString && 
                    jobTimeHHMM === time && // <-- เปรียบเทียบกับ HH:MM ที่ปรับแล้ว
                    (filterValue === 'all' || job.team === filterValue)
                );
            });
            
            jobsInSlot.forEach(job => {
                const jobDiv = document.createElement('div');
                const statusClass = `status-${job.status}`;
                
                jobDiv.className = `job-card ${statusClass} job-team-${job.team}`;
                jobDiv.innerHTML = `
                    <strong>${job.customer} - ${job.jobType}</strong>
                    ${job.address} (${job.team ? job.team.toUpperCase() : 'N/A'})
                `;
                jobDiv.title = `คลิกเพื่อดูรายละเอียดงาน #${job.customer}`;
                dayCell.appendChild(jobDiv);
                
                // เพิ่ม Event Listener สำหรับโหมดแก้ไขงาน
                jobDiv.addEventListener('click', () => {
                    openJobModal('edit', job);
                });
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
        renderSchedule(currentMonday, teamFilter.value);

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
    
    // เก็บ reference ไว้ใน Global Variable
    currentModal = modal; 

    // Setup Close Button (cancel-btn) inside the Modal Content
    const closeBtnInModal = modalContent.querySelector('.cancel-btn'); 
    if (closeBtnInModal) {
        closeBtnInModal.addEventListener('click', () => {
             modal.remove();
             currentModal = null; // เคลียร์ reference
        });
    }

    // ปิด Modal เมื่อคลิกนอกพื้นที่
    window.onclick = function(event) {
        if (event.target == modal) {
            modal.remove();
            currentModal = null; // เคลียร์ reference
        }
    }
    
    // เรียกใช้ Callback หลังจาก Modal ถูกสร้างและเนื้อหาถูกแทรก
    if (afterLoadedCallback) {
        afterLoadedCallback(modalContent);
    }
};

/**
 * NEW: ฟังก์ชันสร้างและแสดง Modal สำหรับเพิ่ม/แก้ไขงาน
 * @param {string} mode - 'add' หรือ 'edit'
 * @param {Object} jobData - ข้อมูลงานเดิม (ถ้าเป็นโหมด 'edit')
 */
const openJobModal = async (mode = 'add', jobData = {}) => {
    const url = '/schedule/input';
    
    try {
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        let htmlContent = await response.text();
        
        // สร้าง Modal พร้อม Callback
        createModal(htmlContent, (modalContent) => {
            const form = modalContent.querySelector('#new-job-form');
            const orderIdInput = modalContent.querySelector('#orderId');
            const submitBtn = modalContent.querySelector('.submit-btn');
            const formTitle = modalContent.querySelector('.form-title');

            if (form) {
                
                // 1. ตั้งค่าตาม Mode
                if (mode === 'edit' && jobData.id) {
                    formTitle.textContent = `แก้ไขงานติดตั้ง (ID: #${jobData.id})`;
                    submitBtn.textContent = 'บันทึกการแก้ไข';
                    
                    // กรอกข้อมูลเดิมลงในฟอร์ม (Job ID/OrderId, customerName, date, time, team, jobType, status)
                    // ใช้ฟิลด์ที่เหมาะสมใน form
                    
                    form.elements['jobId'].value = jobData.id; // ใช้ Job ID จริงในการอัปเดต
                    form.elements['orderId'].value = jobData.id; // ใช้ ID เป็น OrderId ด้วย (ตามโครงสร้าง Mock Data)
                    form.elements['customerName'].value = jobData.customer || '';
                    form.elements['appointmentDate'].value = jobData.date || ''; 
                    // ตัดส่วนเวลาให้เหลือ HH:MM ก่อนแสดงในฟอร์ม
                    form.elements['appointmentTime'].value = jobData.time ? String(jobData.time).substring(0, 5) : ''; 
                    form.elements['address'].value = jobData.address || '';
                    form.elements['team'].value = jobData.team || 'team-a';
                    form.elements['jobType'].value = jobData.jobType || 'ติดตั้ง';
                    form.elements['status'].value = jobData.status || 'scheduled';

                    // --- NEW: เพิ่มปุ่มลบงานและ Listener สำหรับโหมดแก้ไข ---
                    const deleteBtnHtml = `<button type="button" id="delete-job-btn" class="remove-btn" style="background-color: #dc3545; margin-left: 10px;">ลบงานนี้</button>`;
                    submitBtn.insertAdjacentHTML('afterend', deleteBtnHtml);

                    const deleteBtn = modalContent.querySelector('#delete-job-btn');
                    deleteBtn.addEventListener('click', () => {
                        // ส่ง ID งานจริงไปยืนยันและลบ
                        confirmAndDeleteJob(jobData.id);
                    });
                    // ----------------------------------------------------

                } else {
                    // 'add' mode
                    formTitle.textContent = 'เพิ่มงานติดตั้งใหม่';
                    submitBtn.textContent = 'บันทึกงานใหม่';
                    
                    // เคลียร์ ID และตั้งค่า Order ID อัตโนมัติสำหรับงานใหม่
                    form.elements['jobId'].value = ''; 
                    orderIdInput.value = generateOrderId();
                    
                    // ตั้งค่าเริ่มต้นวันที่เป็นวันที่ปัจจุบัน
                    form.elements['appointmentDate'].value = formatDate(new Date()); 
                }

                // 2. จัดการ Submit ฟอร์ม (ใช้ฟังก์ชันที่อัปเดตแล้ว)
                handleFormSubmission(form);
            }
        });

    } catch (error) {
        console.error("Error loading partial view:", error);
        showStatusModal('ไม่สามารถโหลดฟอร์มได้', 'กรุณาตรวจสอบการเชื่อมต่อเซิร์ฟเวอร์หรือ Route /schedule/input', false);
    }
};

// -------------------------------------------------------------------
// E. ฟังก์ชันจัดการ Submit ฟอร์มงานใหม่/แก้ไข (Job Submission)
// *FIXED: เปลี่ยนจากการใช้ form.onsubmit เป็น custom property เพื่อป้องกัน listener stacking*
// -------------------------------------------------------------------
const handleFormSubmission = (form) => {
    // 1. ลองลบ Listener เก่าออกก่อน โดยใช้ reference ที่เก็บไว้ใน custom property
    const oldListener = form._submitListener;
    if (oldListener) {
        // ลบ Listener เก่าด้วย reference เดิม
        form.removeEventListener('submit', oldListener); 
    }
    
    // สร้าง Listener ใหม่
    const newListener = async (e) => {
        e.preventDefault();
        
        const formData = new FormData(form);
        
        const data = Object.fromEntries(formData.entries());
        
        // ตรวจสอบว่ามี jobId ไหม ถ้ามี คือโหมดแก้ไข (Update)
        const jobId = data.jobId; 
        const isEditMode = !!jobId;

        // กำหนด Endpoint และ Message
        const endpoint = isEditMode ? '/schedule/update' : '/schedule/new';
        const successTitle = isEditMode ? 'แก้ไขงานสำเร็จ!' : 'บันทึกข้อมูลสำเร็จ!';
        const successMsg = isEditMode ? 'งานติดตั้งถูกแก้ไขเรียบร้อยแล้ว ระบบกำลังอัปเดตตาราง...' : 'งานติดตั้งใหม่ถูกบันทึกเรียบร้อยแล้ว ระบบกำลังอัปเดตตาราง...';
        
        const submitBtn = form.querySelector('.submit-btn');
        const originalBtnText = submitBtn.textContent;
        submitBtn.disabled = true;
        submitBtn.textContent = 'กำลังบันทึก...';
        
        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                // ส่งข้อมูลทั้งหมดไป Server
                body: JSON.stringify(data) 
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const result = await response.json();
            
            // ปิด Modal ฟอร์ม
            if (currentModal) {
                currentModal.remove();
                currentModal = null;
            }

            

            if (result.success) {
                // แสดง Modal สำเร็จ
                showStatusModal(
                    successTitle, 
                    successMsg, 
                    true, 
                    // Callback เมื่อกด OK: ดึงข้อมูลใหม่และ Refresh UI
                    () => reloadDataAndRefreshView(currentMonday, teamFilter.value)
                );
            } else {
                // ถ้า Server ตอบกลับมาว่าไม่สำเร็จ แต่ HTTP status เป็น 200
                throw new Error(result.message || 'Server returned failure.');
            }
            
        } catch (error) {
            console.error("Error submitting job:", error);
            // แสดง Modal ข้อผิดพลาด
            showStatusModal('เกิดข้อผิดพลาดในการบันทึก', `ไม่สามารถบันทึก/แก้ไขงานได้: ${error.message}`, false);
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = originalBtnText;
        }
    };

    // 2. แนบ Listener ใหม่
    form.addEventListener('submit', newListener);
    // 3. เก็บ reference ของ Listener ใหม่ไว้ใน custom property
    form._submitListener = newListener; 
};


// -------------------------------------------------------------------
// F. ฟังก์ชันจัดการการลบงาน (Job Deletion)
// -------------------------------------------------------------------
const confirmAndDeleteJob = (orderId) => {
    // ปิด Modal ฟอร์มงานที่กำลังเปิดอยู่ก่อน
    if (currentModal) {
        currentModal.remove();
        currentModal = null;
    }

    showStatusModal(
        'ยืนยันการลบ',
        `คุณแน่ใจหรือไม่ว่าต้องการลบงานติดตั้ง #${orderId} นี้? การดำเนินการนี้ไม่สามารถยกเลิกได้`,
        false, // ใช้สี/ไอคอนเตือนภัย (สีแดง)
        async () => {
            // Callback เมื่อผู้ใช้กด OK ใน Modal ยืนยัน
            try {
                const response = await fetch('/schedule/delete', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ orderId: orderId })
                });

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const result = await response.json();

                if (result.success) {
                    // ลบสำเร็จ
                    showStatusModal(
                        'ลบงานสำเร็จ',
                        `งานติดตั้ง #${orderId} ถูกลบออกจากระบบแล้ว`,
                        true,
                        () => reloadDataAndRefreshView(currentMonday, teamFilter.value)
                    );
                } else {
                    // Server ตอบกลับมาว่าไม่สำเร็จ
                    throw new Error(result.message || 'Server returned failure.');
                }
            } catch (error) {
                console.error("Error deleting job:", error);
                showStatusModal(
                    'เกิดข้อผิดพลาดในการลบ',
                    `ไม่สามารถลบงาน #${orderId} ได้: ${error.message}`,
                    false
                );
            }
        }
    );
};


document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialize Global Data and DOM Elements
    // NOTE: liveJobs is assumed to be defined by EJS before this script runs.
    jobsData = Array.isArray(liveJobs) ? liveJobs : [];
    console.log("Loaded Jobs from Database:", jobsData);

        
    scheduleBody = document.getElementById('schedule-body');
    upcomingJobsList = document.getElementById('upcoming-jobs-list');
    teamFilter = document.getElementById('team-filter'); // กำหนดค่าให้ตัวแปร Global teamFilter
    const addBtn = document.querySelector('.add-btn'); 
    
    // 2. Calculate initial currentMonday 
    
    currentMonday = new Date(); 
    
    // หาจุดเริ่มต้นของสัปดาห์ (วันจันทร์)
    // getDay() คือ 0=อาทิตย์, 1=จันทร์, ...
    // การคำนวณนี้จะตั้งค่าเป็นวันจันทร์ของสัปดาห์ปัจจุบันเสมอ
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
    
    // Event Listener สำหรับปุ่ม "เพิ่มงานใหม่" (เรียก openJobModal ในโหมด Add)
    if (addBtn) {
        addBtn.addEventListener('click', () => {
            openJobModal('add'); 
            
            
            
            
        });
    }


    // 4. แสดงผลเริ่มต้น
    renderSchedule(currentMonday, teamFilter.value); 
});