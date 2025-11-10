/**
 * NOTE: ในการใช้งานจริง, ไฟล์นี้ควรถูกโหลดหลังจากไฟล์ EJS ได้กำหนดตัวแปร 'liveJobs' 
 * (ซึ่งมาจากฐานข้อมูล) ใน Global Scope ให้กับ JavaScript แล้ว
 * * ตัวอย่าง: ใน schedule.ejs จะต้องมีโค้ดนี้ก่อนโหลด schedule.js
 * <script> const liveJobs = <%- JSON.stringify(jobs) %>; </script>
 */

document.addEventListener('DOMContentLoaded', () => {
    // ใช้ข้อมูลจาก Server (ถ้าถูกกำหนดไว้ใน EJS) หากไม่ถูกกำหนดจะใช้ Array ว่างเปล่า
    // ** แก้ไข: เนื่องจากตอนนี้ liveJobs ถูกกำหนดใน Global Scope แล้ว เราสามารถอ้างถึงมันได้โดยตรง **
    const jobsData = liveJobs;
    console.log("Loaded Jobs from Database:", jobsData);

    // ตัวแปร DOM Elements ที่ใช้งาน
    const scheduleBody = document.getElementById('schedule-body');
    const upcomingJobsList = document.getElementById('upcoming-jobs-list');
    const teamFilter = document.getElementById('team-filter');
    const addBtn = document.querySelector('.add-btn'); 
    
    // ค่าคงที่
    const timeSlots = ["09:00", "10:00", "11:00", "13:00", "14:00", "15:00", "16:00", "17:00"];
    const daysOfWeek = ["จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์", "อาทิตย์"];
    
    // กำหนดวันที่เริ่มต้นสัปดาห์ (สมมติว่าเป็นวันจันทร์ของสัปดาห์ปัจจุบัน)
    let currentMonday = new Date(); // เริ่มจากวันนี้
    // คำนวณหาวันจันทร์ของสัปดาห์นี้
    currentMonday.setDate(currentMonday.getDate() - (currentMonday.getDay() + 6) % 7);
    
    // ฟังก์ชันช่วยจัดรูปแบบวันที่เป็น YYYY-MM-DD
    const formatDate = (date) => date.toISOString().split('T')[0];

    // -------------------------------------------------------------------
    // A. ฟังก์ชันแสดงงานที่กำลังจะมาถึง (Upcoming Jobs Sidebar)
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
    // B. ฟังก์ชันสร้างตารางปฏิทินหลัก (Schedule Table)
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
                        <strong>#${job.id} - ${job.jobType}</strong>
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
    // C. ฟังก์ชันจัดการ Modal (Popup)
    // -------------------------------------------------------------------
    const createModal = (content) => {
																							  
        const existingModal = document.getElementById('form-modal');
        if (existingModal) {
            existingModal.remove();
        }
        
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
    };
    
    // -------------------------------------------------------------------
    // D. การควบคุมการโต้ตอบ (Event Listeners)
    // -------------------------------------------------------------------

    // 1. ควบคุมการเปลี่ยนสัปดาห์
    document.getElementById('prev-week-btn').addEventListener('click', () => {
        currentMonday.setDate(currentMonday.getDate() - 7);
        renderSchedule(currentMonday, teamFilter.value);
    });

    document.getElementById('next-week-btn').addEventListener('click', () => {
        currentMonday.setDate(currentMonday.getDate() + 7);
        renderSchedule(currentMonday, teamFilter.value);
    });

    // 2. ควบคุมการกรองตามทีมช่าง (มีผลต่อทั้งตารางและแถบด้านข้าง)
    teamFilter.addEventListener('change', (e) => {
        renderSchedule(currentMonday, e.target.value);
    });
    
    // 3. Event Listener สำหรับปุ่ม "เพิ่มงานใหม่" (เรียก Partial View)
    if (addBtn) {
        addBtn.addEventListener('click', async () => {
            const url = '/schedule/input'; 

            try {
                const response = await fetch(url);
                
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                
                const htmlContent = await response.text();
                
                createModal(htmlContent);

            } catch (error) {
                console.error("Error loading partial view:", error);
                // ใช้วิธีแสดงข้อความแทน alert() ในแอปจริง
                // ในตัวอย่างนี้ยังใช้ alert() ตามที่เคยให้ไว้
                alert('ไม่สามารถโหลดฟอร์มเพิ่มงานได้ กรุณาตรวจสอบการเชื่อมต่อเซิร์ฟเวอร์');
            }
        });
    }

    // แสดงผลเริ่มต้น
    renderSchedule(currentMonday, teamFilter.value); 
});