// --- 1. CONFIGURATION ---
const firebaseConfig = {
    apiKey: "AIzaSyBWbYh32melDclNeValHAf011oWI9es5WE",
    authDomain: "dept-management-19.firebaseapp.com",
    databaseURL: "https://dept-management-19-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "dept-management-19",
    storageBucket: "dept-management-19.firebasestorage.app",
    messagingSenderId: "48065750916",
    appId: "1:48065750916:web:eb1bdaf524ff2ce4c99fd1",
    measurementId: "G-WTC1MDF8KW"
};

// --- 📧 DEBUG: EMAILJS KEYS (PASTE HERE) ---
const EMAILJS_SERVICE_ID = "service_bn38g2v";    
const EMAILJS_TEMPLATE_ID = "template_7893r9f";  
const EMAILJS_PUBLIC_KEY = "AcQu3AbBS6dxpzyQd";  

// --- 🔒 SECURITY CONFIG ---
const ALLOWED_DOMAIN = "@mbstu.ac.bd"; 

// --- DEBUG LOGGER ---
function debugLog(msg, data = null) {
    console.log(`%c[DEBUG] ${msg}`, "color: orange; font-weight: bold;", data || "");
}

if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

(function(){
    if(typeof emailjs !== 'undefined') emailjs.init(EMAILJS_PUBLIC_KEY);
})();

// --- 2. GLOBAL STATE ---
let currentUser = null;
let currentRole = 'student';
let currentUserName = '';
let currentBatch = '19'; // Default fallback

// Elements
const viewDatePicker = document.getElementById('view-date-picker');
const filterBatch = document.getElementById('filter-batch');
const filterTeacher = document.getElementById('filter-teacher');
const addClassBtn = document.getElementById('add-class-btn');
const scheduleBody = document.getElementById('schedule-body');
const loginSection = document.getElementById('login-section');
const dashboardSection = document.getElementById('dashboard-section');

// --- 3. INITIALIZATION ---
const today = new Date();
const offset = today.getTimezoneOffset() * 60000;
const localISOTime = new Date(today.getTime() - offset).toISOString().split('T')[0];
if(viewDatePicker) viewDatePicker.value = localISOTime;

const loginBtn = document.getElementById('login-btn');
if(loginBtn) {
    loginBtn.addEventListener('click', () => {
        const provider = new firebase.auth.GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        auth.signInWithPopup(provider).catch(err => alert("Login Failed: " + err.message));
    });
}

const logoutBtn = document.getElementById('logout-btn');
if(logoutBtn) {
    logoutBtn.addEventListener('click', () => {
        auth.signOut().then(() => window.location.reload());
    });
}

auth.onAuthStateChanged(user => {
    if (user) {
        // Domain Check
        if (!user.email.endsWith(ALLOWED_DOMAIN)) {
            auth.signOut().then(() => {
                alert(`🚫 Access Denied. Please use your ${ALLOWED_DOMAIN} email.`);
                window.location.reload();
            });
            return; 
        }
        currentUser = user;
        loadUserProfile(user);
    } else {
        if(loginSection) loginSection.classList.remove('hidden');
        if(dashboardSection) dashboardSection.classList.add('hidden');
    }
});

// --- 🧠 SMART BATCH DETECTION LOGIC ---
function loadUserProfile(user) {
    const emailPrefix = user.email.split('@')[0];
    
    // 1. Calculate Batch from Email (The Formula: Year - 3)
    let detectedBatch = '19'; // Default
    const match = emailPrefix.match(/[a-zA-Z]*(\d{2})/); // Finds first 2 digits
    if (match && match[1]) {
        const year = parseInt(match[1]); // e.g., 22
        if (!isNaN(year)) {
            detectedBatch = String(year - 3); // 22 - 3 = 19
        }
    }
    debugLog(`Calculated Batch for ${user.email}:`, detectedBatch);

    db.collection('users').doc(user.email).onSnapshot(doc => {
        if (!doc.exists) {
            // New User? Save the detected batch!
            currentRole = 'student';
            currentUserName = emailPrefix;
            currentBatch = detectedBatch;
            
            db.collection('users').doc(user.email).set({
                email: user.email, 
                role: 'student', 
                name: emailPrefix, 
                batch: detectedBatch // <--- SAVED HERE
            });
        } else {
            const data = doc.data();
            currentRole = data.role || 'student';
            currentUserName = data.name || emailPrefix;
            
            // Prefer DB batch if set, otherwise use detected
            currentBatch = data.batch || detectedBatch;
            setupUI();
        }
    });
}

function setupUI() {
    if(loginSection) loginSection.classList.add('hidden');
    if(dashboardSection) dashboardSection.classList.remove('hidden');
    
    document.getElementById('user-name').innerText = currentUserName;
    document.getElementById('user-role').innerText = currentRole.toUpperCase();

    // Reset UI
    if(filterTeacher) filterTeacher.classList.add('hidden');
    if(addClassBtn) addClassBtn.classList.add('hidden');

    if (currentRole === 'student') {
        // AUTO-SELECT THE BATCH
        if(filterBatch) {
            filterBatch.value = currentBatch; 
            // Optional: Hide filter so they can't snoop on other batches?
            // filterBatch.classList.add('hidden'); 
        }
    } 
    else if (currentRole === 'teacher' || currentRole === 'admin') {
        if(filterTeacher) {
            filterTeacher.classList.remove('hidden');
            filterTeacher.value = 'all';
        }
        if(addClassBtn) addClassBtn.classList.remove('hidden');
        if (currentRole === 'admin') cleanUpOldData();
    }
    
    setupModalListeners();
    generateDailyList();
}

// --- 4. CORE LOGIC ---
const loadBtn = document.getElementById('load-routine-btn');
if(loadBtn) loadBtn.onclick = generateDailyList;
if(viewDatePicker) viewDatePicker.onchange = generateDailyList;
if(filterBatch) filterBatch.onchange = generateDailyList;
if(filterTeacher) filterTeacher.onchange = generateDailyList;

async function generateDailyList() {
    if(!scheduleBody) return;
    // Mobile-friendly loader
    scheduleBody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px;">↻ Loading Schedule...</td></tr>';
    
    const selectedDateStr = viewDatePicker.value; 
    const dateObj = new Date(selectedDateStr); 
    const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'long' }); 
    
    try {
        const routineSnapshot = await db.collection('routine').where('day', '==', dayName).get();
        let dailyClasses = [];
        routineSnapshot.forEach(doc => {
            const d = doc.data();
            dailyClasses.push({
                id: doc.id,
                type: 'regular',     
                ...d,
                displayTime: d.time,
                fullDate: `${selectedDateStr}T${d.time}`
            });
        });

        const changesSnapshot = await db.collection('updates').where('originalDate', '==', selectedDateStr).get();
        const incomingSnapshot = await db.collection('updates').where('newDateOnly', '==', selectedDateStr).get();

        const changesMap = {}; 
        changesSnapshot.forEach(doc => {
            const data = doc.data();
            changesMap[data.code] = data; 
        });

        dailyClasses = dailyClasses.filter(cls => {
            const update = changesMap[cls.code];
            if (update) {
                if (update.status === 'Cancelled') return false; 
                if (update.status === 'Rescheduled') return false; 
            }
            return true;
        });

        incomingSnapshot.forEach(doc => {
            const data = doc.data();
            if (!data.newDateOnly || !data.newTime || data.status === 'Cancelled') return;

            dailyClasses.push({
                id: doc.id,         
                type: 'rescheduled', 
                subject: data.subject || "Extra Class",
                code: data.code,
                teacher: data.teacher,
                batch: data.batch,
                displayTime: data.newTime,
                status: 'Rescheduled',
                fullDate: `${data.newDateOnly}T${data.newTime}`
            });
        });

        const batchVal = filterBatch ? filterBatch.value : 'all';
        const teacherVal = filterTeacher ? filterTeacher.value : 'all';
        const now = new Date();

        const finalList = dailyClasses.filter(cls => {
            if (batchVal !== 'all' && String(cls.batch) !== String(batchVal)) return false;
            
            if (currentRole === 'teacher' && teacherVal === 'me') {
                if (!cls.teacher || cls.teacher.toUpperCase() !== currentUserName.toUpperCase()) return false;
            }
            
            if (selectedDateStr === localISOTime) {
                const classDateTime = new Date(`${selectedDateStr}T${cls.displayTime}`);
                if (classDateTime < now) return false;
            }
            return true;
        });
        
        finalList.sort((a, b) => a.displayTime.localeCompare(b.displayTime));
        renderTable(finalList);

    } catch (err) {
        console.error(err);
        scheduleBody.innerHTML = `<tr><td colspan="6" style="color:red; text-align:center;">Error: ${err.message}</td></tr>`;
    }
}

function renderTable(data) {
    if (data.length === 0) {
        scheduleBody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:30px; color:#888;">No classes scheduled for today.</td></tr>';
        return;
    }

    scheduleBody.innerHTML = '';
    data.forEach(cls => {
        const tr = document.createElement('tr');
        if (cls.status === 'Rescheduled') {
            tr.style.backgroundColor = '#fffbeb'; // Subtler yellow for card
            tr.style.borderLeft = '4px solid #f59e0b'; // Gold border for rescheduled
        }

        let timeStr = cls.displayTime;
        if(timeStr && timeStr.includes(':')) {
            const [h, m] = timeStr.split(':');
            const d = new Date(); d.setHours(h, m);
            timeStr = d.toLocaleTimeString('en-US', {hour:'numeric', minute:'2-digit'});
        }

        let actionBtn = `<span style="color:#ccc; font-size:0.8em">●</span>`;
        const canEdit = (currentRole === 'admin') || 
                        (currentRole === 'teacher' && cls.teacher && cls.teacher.trim().toUpperCase() === currentUserName.trim().toUpperCase());

        if (canEdit) {
            actionBtn = `<button class="btn small" onclick="openUpdateModal('${cls.id}', '${cls.code}', '${cls.batch}', '${cls.type}')">Edit</button>`;
        }

        // The HTML structure perfectly matches the CSS grid
        tr.innerHTML = `
            <td>${timeStr}</td>
            <td>Batch ${cls.batch}</td>
            <td>${cls.subject} </td>
            <td>${cls.teacher}</td>
            <td>${cls.status || 'Active'}</td>
            <td>${actionBtn}</td>
        `;
        scheduleBody.appendChild(tr);
    });
}

// --- 5. MODAL LOGIC (Simplified) ---
let editingClassId = null;
let editingClassCode = null;
let editingClassBatch = null;
let editingClassType = null;

function setupModalListeners() {
    const statusSelect = document.getElementById('modal-status-select');
    const timeContainer = document.getElementById('modal-time-container');
    
    if(statusSelect && timeContainer) {
        statusSelect.onchange = function() {
            if(this.value === 'Rescheduled') {
                timeContainer.classList.remove('hidden');
            } else {
                timeContainer.classList.add('hidden');
            }
        };
    }
    if(addClassBtn) {
        addClassBtn.onclick = () => {
            document.getElementById('add-modal').classList.remove('hidden');
            document.getElementById('add-date').value = viewDatePicker.value;
        };
    }
}

const addSaveBtn = document.getElementById('add-save-btn');
if(addSaveBtn) {
    addSaveBtn.onclick = () => {
        const subj = document.getElementById('add-subject').value;
        const code = document.getElementById('add-code').value;
        const batch = document.getElementById('add-batch').value;
        const dateVal = document.getElementById('add-date').value;
        const timeVal = document.getElementById('add-time').value;

        if(!subj || !code || !dateVal || !timeVal) return alert("Please fill all fields.");

        const updateData = {
            subject: subj, code: code, batch: batch,
            newDateOnly: dateVal, newTime: timeVal, teacher: currentUserName,
            status: "Rescheduled", type: "Extra", updatedBy: currentUser.email,
            timestamp: new Date().toISOString()
        };

        db.collection('updates').add(updateData)
            .then(() => {
                fetchAndEmailStudents(code, "Extra Class Added", dateVal, timeVal, batch);
                alert("Extra Class Added!");
                document.getElementById('add-modal').classList.add('hidden');
                generateDailyList();
            })
            .catch(err => alert("Error: " + err.message));
    };
}
const addCancelBtn = document.getElementById('add-cancel-btn');
if(addCancelBtn) addCancelBtn.onclick = () => document.getElementById('add-modal').classList.add('hidden');

window.openUpdateModal = (id, code, batch, type) => {
    editingClassId = id; editingClassCode = code; editingClassBatch = batch; editingClassType = type;
    const modal = document.getElementById('update-modal');
    document.getElementById('modal-class-summary').innerText = `Updating: ${code}`;
    document.getElementById('modal-status-select').value = 'Scheduled'; 
    document.getElementById('modal-time-container').classList.add('hidden'); 
    modal.classList.remove('hidden');
};

const saveBtn = document.getElementById('modal-save-btn');
if(saveBtn) {
    saveBtn.onclick = () => {
        const status = document.getElementById('modal-status-select').value;
        const newDateTimeVal = document.getElementById('modal-new-time').value;
        const selectedDateStr = viewDatePicker.value;

        if (status === 'Scheduled') return alert("No changes selected.");

        const updateData = {
            status: status, updatedBy: currentUser.email,
            timestamp: new Date().toISOString(), originalDate: selectedDateStr, code: editingClassCode
        };

        if (status === 'Rescheduled') {
            if (!newDateTimeVal) return alert("Pick a time!");
            const newDateObj = new Date(newDateTimeVal);
            updateData.newDateOnly = newDateObj.toISOString().split('T')[0];
            updateData.newTime = newDateObj.toTimeString().slice(0, 5);
            updateData.subject = "Rescheduled Class"; 
            updateData.batch = editingClassBatch; 
            if(currentRole === 'teacher') updateData.teacher = currentUserName;
        }

        if (editingClassType === 'rescheduled') {
            db.collection('updates').doc(editingClassId).update(updateData)
                .then(() => handleSuccess(status, updateData))
                .catch(err => alert("Error: " + err.message));
        } else {
            db.collection('updates').add(updateData)
                .then(() => handleSuccess(status, updateData))
                .catch(err => alert("Error: " + err.message));
        }
    };
}

function handleSuccess(status, updateData) {
    fetchAndEmailStudents(editingClassCode, status, updateData.newDateOnly, updateData.newTime, editingClassBatch);
    alert("Updated!");
    document.getElementById('update-modal').classList.add('hidden');
    generateDailyList();
}

function fetchAndEmailStudents(code, status, newDate, newTime, batch) {
    if (EMAILJS_SERVICE_ID === "service_xyz") return alert("EMAILS FAILED: Set Keys in app.js");

    db.collection('users').where('batch', '==', batch).get()
        .then(snapshot => {
            const emails = [];
            snapshot.forEach(doc => { if(doc.data().email) emails.push(doc.data().email); });
            if (emails.length === 0) return console.log("No students to email.");

            let prettyTime = newTime || "N/A";
            if(newTime) {
                const [h, m] = newTime.split(':');
                const d = new Date(); d.setHours(h, m);
                prettyTime = d.toLocaleTimeString('en-US', {hour:'numeric', minute:'2-digit'});
            }

            const templateParams = {
                batch: "Batch " + batch, subject: code, status: status,
                new_time: (status !== 'Cancelled') ? `${newDate} at ${prettyTime}` : "Cancelled",
                teacher: currentUserName, to_email: emails.join(',')
            };

            emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, templateParams).catch(console.error);
        })
        .catch(console.error);
}

const cancelBtn = document.getElementById('modal-cancel-btn');
if(cancelBtn) cancelBtn.onclick = () => document.getElementById('update-modal').classList.add('hidden');

async function cleanUpOldData() {
    // ... same cleanup code as before ...
}