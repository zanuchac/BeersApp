/**
 * order_logic.js - Logic สำหรับจัดการ Form Order และแสดง Quotation Modal
 * ปรับปรุงเพื่อให้รองรับโครงสร้าง Modal และการพิมพ์อย่างเหมาะสม
 */

document.addEventListener('DOMContentLoaded', () => {
    // ----------------------------------------------------------------------
    // 1. GLOBAL VARIABLES & INITIALIZATION
    // ----------------------------------------------------------------------

    const orderInputView = document.getElementById('order-input-view');
    const quotationModal = document.getElementById('quotation-modal');
    const addItemForm = document.getElementById('addItemForm');
    const productTypeSelect = document.getElementById('productType');
    const mungLauetFields = document.getElementById('mungLauetFields');
    const paMaanFields = document.getElementById('paMaanFields');
    const subItemList = document.getElementById('subItemList');
    const itemCountSpan = document.getElementById('itemCount');
    const currentSubtotalSpan = document.getElementById('currentSubtotal');
    const saveOrderButton = document.getElementById('saveOrderButton');
    const resetOrderButton = document.getElementById('resetOrderButton');
    const startNewOrderButton = document.getElementById('startNewOrderButton');
    const closeModalButton = quotationModal.querySelector('.close-button');
    const printQuotationButton = document.getElementById('printQuotationButton');
    const statusMessage = document.getElementById('status-message');

    let subItems = [];
    let currentOrderId = generateUniqueId(); // สร้าง Job ID เมื่อโหลดหน้าครั้งแรก

    // ตั้งค่า Job ID ครั้งแรก
    document.getElementById('orderId').value = currentOrderId;

    // ----------------------------------------------------------------------
    // 2. UTILITY FUNCTIONS
    // ----------------------------------------------------------------------

    /**
     * สร้างรหัส Job ID ที่ไม่ซ้ำกัน (ตัวอย่าง)
     * @returns {string} ID รูปแบบ 'JOB-YYMMDD-XXXX'
     */
    function generateUniqueId() {
        const date = new Date();
        const yymmdd = [
            date.getFullYear().toString().substring(2),
            (date.getMonth() + 1).toString().padStart(2, '0'),
            date.getDate().toString().padStart(2, '0')
        ].join('');
        const randomNum = Math.floor(Math.random() * 9000) + 1000;
        return `JOB-${yymmdd}-${randomNum}`;
    }

    /**
     * แสดงข้อความสถานะ
     * @param {string} message ข้อความ
     * @param {string} type 'success', 'error', 'info'
     */
    function showStatus(message, type = 'info') {
        statusMessage.textContent = message;
        statusMessage.className = `status-message ${type}`;
        statusMessage.style.display = 'block';
        setTimeout(() => {
            statusMessage.style.display = 'none';
        }, 5000);
    }

    /**
     * จัดรูปแบบตัวเลขเป็นสกุลเงิน
     * @param {number} num ตัวเลข
     * @returns {string} สตริงสกุลเงิน
     */
    function formatCurrency(num) {
        // ใช้ toLocaleString เพื่อรองรับการจัดรูปแบบตัวเลข (เช่น ใส่ comma)
        return parseFloat(num).toFixed(2).toLocaleString('en-US'); 
    }

    /**
     * รีเซ็ตค่าในฟิลด์สินค้าที่ซ่อนอยู่ทั้งหมด
     */
    function resetHiddenFields() {
        const allHiddenInputs = [...mungLauetFields.querySelectorAll('input, select, textarea'), ...paMaanFields.querySelectorAll('input, select, textarea')];
        allHiddenInputs.forEach(input => {
            if (input.type === 'number') {
                input.value = '';
            } else if (input.tagName === 'SELECT') {
                input.selectedIndex = 0;
            } else {
                input.value = '';
            }
        });
        mungLauetFields.style.display = 'none';
        paMaanFields.style.display = 'none';
    }


    // ----------------------------------------------------------------------
    // 3. UI/FORM HANDLERS
    // ----------------------------------------------------------------------

    /**
     * สลับการแสดง Form เฉพาะประเภทสินค้า
     */
    productTypeSelect.addEventListener('change', () => {
        const selectedType = productTypeSelect.value;
        
        resetHiddenFields(); // รีเซ็ตฟิลด์ทั้งหมดก่อนสลับ

        if (selectedType === 'มุ้งลวด') {
            mungLauetFields.style.display = 'block';
            document.getElementById('mungQuantity').value = 1;
        } else if (selectedType === 'ผ้าม่าน') {
            paMaanFields.style.display = 'block';
            document.getElementById('curtainQuantity').value = 1;
        }
    });

    /**
     * เพิ่มรายการย่อยเข้าใน Order
     */
    addItemForm.addEventListener('submit', (event) => {
        event.preventDefault();
        
        const customerName = document.getElementById('customerName').value.trim();
        const productType = productTypeSelect.value;
        
        if (!customerName || !productType) {
            showStatus('กรุณากรอกชื่อลูกค้าและเลือกประเภทสินค้า', 'error');
            return;
        }

        let item = { id: Date.now(), customerName: customerName, type: productType };
        let pricePerUnit = 0;
        let quantity = 0;
        let isMung = productType === 'มุ้งลวด';

        // กำหนด ID ฟิลด์ตามประเภทสินค้า
        const typeId = isMung ? 'mungType' : 'curtainType';
        const widthId = isMung ? 'mungWidth' : 'curtainWidth';
        const heightId = isMung ? 'mungHeight' : 'curtainHeight';
        const quantityId = isMung ? 'mungQuantity' : 'curtainQuantity';
        const priceId = isMung ? 'mungPricePerUnit' : 'curtainPricePerUnit';
        const noteId = isMung ? 'mungNote' : 'curtainNote';
        const locationId = isMung ? 'mungLocation' : 'curtainLocation';

        // ดึงค่าพื้นฐาน
        const type = document.getElementById(typeId).value;
        const width = parseFloat(document.getElementById(widthId).value) || 0;
        const height = parseFloat(document.getElementById(heightId).value) || 0;
        quantity = parseFloat(document.getElementById(quantityId).value) || 1;
        pricePerUnit = parseFloat(document.getElementById(priceId).value) || 0;
        const note = document.getElementById(noteId).value.trim();
        const location = document.getElementById(locationId).value;

        if (!type || width <= 0 || height <= 0 || pricePerUnit <= 0 || quantity <= 0) {
             showStatus(`กรุณากรอกข้อมูล ${productType} (ประเภท/ขนาด/ราคา/จำนวน) ให้ครบถ้วน`, 'error');
             return;
        }
        
        // Build Item Object
        item.width = width;
        item.height = height;
        item.quantity = quantity;
        item.pricePerUnit = pricePerUnit;
        item.location = location;
        item.note = note;
        item.total = pricePerUnit * quantity;

        if (isMung) {
            item.mungType = type;
        } else {
            // เพิ่มฟิลด์เฉพาะผ้าม่าน
            item.curtainType = type;
            item.color = document.getElementById('curtainColorCode').value.trim();
            item.rail = document.getElementById('curtainRailCode').value.trim();
        }

        subItems.push(item);
        
        renderSubItemList();
        
        // ล้างฟอร์มเฉพาะฟิลด์สินค้าย่อย (เก็บชื่อลูกค้าและประเภทไว้)
        addItemForm.reset();
        document.getElementById('customerName').value = customerName;
        productTypeSelect.value = productType; 
        
        // เรียกใช้ change event เพื่อแสดงฟิลด์ที่เหมาะสมและตั้งค่า Quantity = 1
        productTypeSelect.dispatchEvent(new Event('change'));

        showStatus('เพิ่มรายการสินค้าเรียบร้อยแล้ว', 'success');
    });

    /**
     * แสดงรายการย่อยทั้งหมดในกล่องสรุป
     */
    function renderSubItemList() {
        subItemList.innerHTML = '';
        let subtotal = 0;

        subItems.forEach((item, index) => {
            const li = document.createElement('li');
            li.setAttribute('data-id', item.id);
            
            const detailType = item.type === 'มุ้งลวด' ? item.mungType : item.curtainType;

            li.innerHTML = `
                <div>
                    <strong>${index + 1}. ${item.type}</strong>
                    <small>${detailType} (${item.width}x${item.height} ซม. | ${item.quantity} บาน)</small>
                </div>
                <div class="price-info">
                    ${formatCurrency(item.total)} บาท
                    <button type="button" class="delete-item-btn" data-id="${item.id}">ลบ</button>
                </div>
            `;
            subItemList.appendChild(li);
            subtotal += item.total;
        });

        itemCountSpan.textContent = subItems.length;
        currentSubtotalSpan.textContent = formatCurrency(subtotal);
        saveOrderButton.disabled = subItems.length === 0;

        // Add event listener for delete buttons
        subItemList.querySelectorAll('.delete-item-btn').forEach(button => {
            button.addEventListener('click', deleteItem);
        });
    }

    /**
     * ลบรายการย่อย
     */
    function deleteItem(event) {
        const itemId = parseInt(event.target.dataset.id);
        subItems = subItems.filter(item => item.id !== itemId);
        renderSubItemList();
        showStatus('ลบรายการสินค้าเรียบร้อยแล้ว', 'info');
    }

    /**
     * รีเซ็ตฟอร์มและรายการย่อยทั้งหมด
     */
    resetOrderButton.addEventListener('click', () => {
        if (confirm('คุณแน่ใจหรือไม่ที่จะยกเลิก Order นี้? ข้อมูลที่กรอกทั้งหมดจะหายไป')) {
            subItems = [];
            addItemForm.reset();
            currentOrderId = generateUniqueId();
            document.getElementById('orderId').value = currentOrderId;
            renderSubItemList();
            resetHiddenFields(); // เรียกใช้ฟังก์ชันรีเซ็ตฟิลด์ที่ซ่อน
            showStatus('Order ถูกยกเลิกและเริ่มต้นใหม่แล้ว', 'info');
        }
    });

    // ----------------------------------------------------------------------
    // 4. QUOTATION MODAL LOGIC
    // ----------------------------------------------------------------------

    /**
     * บันทึก Order และแสดง Quotation Modal
     */
    saveOrderButton.addEventListener('click', () => {
        if (subItems.length === 0) {
            showStatus('ไม่สามารถบันทึกได้ เนื่องจากไม่มีรายการสินค้า', 'error');
            return;
        }

        // 1. เติมข้อมูลใน Quotation Modal
        populateQuotationModal();
        
        // 2. แสดง Modal
        quotationModal.style.display = 'flex'; // ใช้ flex เพื่อจัดให้อยู่กึ่งกลางได้ง่าย

        showStatus(`Order ID ${currentOrderId} ถูกบันทึกและสร้างใบเสนอราคาแล้ว!`, 'success');
    });
    
    /**
     * ปิด Modal
     */
    closeModalButton.addEventListener('click', () => {
        quotationModal.style.display = 'none';
    });
    
    // ปิด Modal เมื่อคลิกนอกพื้นที่ Modal 
    window.addEventListener('click', (event) => {
        if (event.target === quotationModal) {
            quotationModal.style.display = 'none';
        }
    });

    /**
     * เริ่ม Order ใหม่และปิด Modal
     */
    startNewOrderButton.addEventListener('click', () => {
        quotationModal.style.display = 'none';
        // เคลียร์ข้อมูลทั้งหมดและเริ่มใหม่
        subItems = [];
        addItemForm.reset();
        currentOrderId = generateUniqueId();
        document.getElementById('orderId').value = currentOrderId;
        renderSubItemList();
        resetHiddenFields();
        
        showStatus('เริ่มต้น Order ใหม่เรียบร้อยแล้ว', 'info');
    });

    /**
     * เติมข้อมูลลงในตาราง Quotation Modal
     */
    function populateQuotationModal() {
        const customerName = document.getElementById('customerName').value;
        const body = document.getElementById('quotation-table-body');
        body.innerHTML = '';
        
        let subtotal = 0;

        subItems.forEach((item, index) => {
            const row = body.insertRow();
            row.insertCell(0).textContent = index + 1; // ลำดับ
            
            // รายละเอียดสินค้า
            let description = '';
            let itemTypeDetail = '';
            
            if (item.type === 'มุ้งลวด') {
                itemTypeDetail = item.mungType;
                description = `ประตู/หน้าต่าง: ${item.location}`;
                if (item.note) description += ` | หมายเหตุ: ${item.note}`;
            } else if (item.type === 'ผ้าม่าน') {
                itemTypeDetail = item.curtainType;
                description = `ประตู/หน้าต่าง: ${item.location}`;
                if (item.color) description += ` | สี: ${item.color}`;
                if (item.rail) description += ` | ราง: ${item.rail}`;
                if (item.note) description += ` | หมายเหตุ: ${item.note}`;
            }
            
            row.insertCell(1).innerHTML = `<strong>${item.type}:</strong> ${itemTypeDetail}<br><small>${description}</small>`;
            row.insertCell(2).textContent = item.width;
            row.insertCell(3).textContent = item.height;
            row.insertCell(4).textContent = item.quantity;
            row.insertCell(5).textContent = formatCurrency(item.pricePerUnit);
            row.insertCell(6).textContent = formatCurrency(item.total);
            row.cells[6].classList.add('col-num'); // จัดขวา

            subtotal += item.total;
        });

        const vatRate = 0.07;
        const vat = subtotal * vatRate;
        const total = subtotal + vat;

        // เติมข้อมูลส่วนหัวและส่วนสรุป
        document.getElementById('quotation-date').textContent = new Date().toLocaleDateString('th-TH', { 
            year: 'numeric', month: 'long', day: 'numeric' 
        });
        document.getElementById('quotation-customer-name').textContent = customerName;
        document.getElementById('quotation-job-id').textContent = currentOrderId;

        document.getElementById('quotation-subtotal').textContent = formatCurrency(subtotal);
        document.getElementById('quotation-vat').textContent = formatCurrency(vat);
        document.getElementById('quotation-total').textContent = formatCurrency(total);
    }
    
    // ----------------------------------------------------------------------
    // 5. PRINTING LOGIC (ใช้สำหรับ PDF Export)
    // ----------------------------------------------------------------------

    printQuotationButton.addEventListener('click', () => {
        // ซ่อนปุ่มและองค์ประกอบที่ไม่ต้องการให้พิมพ์
        const actions = document.querySelector('.quotation-actions');
        const closeBtn = document.querySelector('.close-button');
        
        actions.style.display = 'none';
        closeBtn.style.display = 'none';
        
        // สั่งพิมพ์
        window.print();
        
        // แสดงกลับมาหลังจากสั่งพิมพ์
        actions.style.display = 'flex'; 
        closeBtn.style.display = 'block'; 
    });

    // ----------------------------------------------------------------------
    // 6. INITIAL LOAD
    // ----------------------------------------------------------------------
    
    // ตั้งค่าเริ่มต้นเมื่อโหลดหน้า
    renderSubItemList(); 
    productTypeSelect.dispatchEvent(new Event('change')); // จัดการแสดง/ซ่อนฟิลด์ในตอนต้น
});