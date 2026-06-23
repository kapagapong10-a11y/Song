import { initializeApp } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-auth.js";
import { getDatabase, ref, set, push, get, onValue, update, remove, runTransaction } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-database.js";

// Firebase Configuration จากผู้ใช้
const firebaseConfig = {
  apiKey: "AIzaSyDS2Nol9xO6UzGXBv8mYbxyxc0nVp74oz8",
  authDomain: "song-5883e.firebaseapp.com",
  databaseURL: "https://song-5883e-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "song-5883e",
  storageBucket: "song-5883e.firebasestorage.app",
  messagingSenderId: "623791116667",
  appId: "1:623791116667:web:5d9318b2dad7d4ffa36dde",
  measurementId: "G-NNF61V3Y16"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

let isLoginMode = true;
let currentUserData = null;
let currentRoomId = null;

// ฟังก์ชันดึงวันที่ปัจจุบันรูปแบบไทย (สำหรับเช็คเที่ยงคืนเพื่อรีเซ็ตอัตโนมัติ)
function getThaiDateString() {
    return new Date().toLocaleDateString("en-US", { timeZone: "Asia/Bangkok" });
}

// ระบบรีเซ็ตห้องอัตโนมัติเมื่อขึ้นวันใหม่ ป้องกัน Error ฐานข้อมูลว่างเปล่า
function checkAndResetRoom(roomName) {
    const today = getThaiDateString();
    const roomRef = ref(db, `rooms/${roomName}`);
    get(roomRef).then((snapshot) => {
        if (snapshot.exists()) {
            const roomData = snapshot.val();
            if (roomData.lastReset !== today) {
                remove(ref(db, `songs/${roomName}`));
                update(ref(db, `rooms/${roomName}`), { lastReset: today });
            }
        }
    }).catch(err => console.error("Reset Check Error:", err));
}

// --- ผูกฟังก์ชันเข้ากับหน้าต่าง Window เพื่อแก้ไขปัญหาปุ่มกดไม่ทำงาน ---
window.switchView = (viewId) => {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');
};

window.toggleAuthMode = () => {
    isLoginMode = !isLoginMode;
    document.getElementById('authTitle').innerText = isLoginMode ? 'เข้าสู่ระบบ' : 'สมัครสมาชิก';
    document.getElementById('authBtn').innerText = isLoginMode ? 'เข้าสู่ระบบ' : 'สมัครสมาชิก';
    document.getElementById('toggleAuthBtn').innerText = isLoginMode ? 'ยังไม่มีบัญชี? สมัครเลย' : 'มีบัญชีแล้ว? เข้าสู่ระบบ';
    document.getElementById('signupFields').style.display = isLoginMode ? 'none' : 'block';
};

window.showAdminLogin = () => {
    isLoginMode = true;
    document.getElementById('authTitle').innerText = 'Admin Login';
    document.getElementById('signupFields').style.display = 'none';
    document.getElementById('authBtn').innerText = 'เข้าสู่ระบบแอดมิน';
    document.getElementById('email').value = 'admin@admin.com'; 
};

window.showAddSong = () => { window.switchView('addSongView'); };
window.showStudentView = () => { window.switchView('studentView'); };

// --- ระบบยืนยันตัวตนและการสร้างฐานข้อมูลสมาชิก ---
window.handleAuth = async () => {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    
    if(!email || !password) return alert("กรุณากรอกอีเมลและรหัสผ่าน");

    try {
        if (isLoginMode) {
            await signInWithEmailAndPassword(auth, email, password);
        } else {
            const fullname = document.getElementById('fullname').value;
            const classroom = document.getElementById('classroom').value.trim().replace(/\//g, '-'); 
            const studentNo = document.getElementById('studentNo').value;
            
            if(!fullname || !classroom || !studentNo) return alert("กรุณากรอกข้อมูลส่วนตัวให้ครบถ้วน");

            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            // โครงสร้างฐานข้อมูลนักเรียนแบบอัตโนมัติเพื่อป้องกัน Error
            await set(ref(db, 'users/' + userCredential.user.uid), {
                fullname: fullname,
                classroom: classroom,
                studentNo: parseInt(studentNo),
                role: 'user'
            });
            alert('สมัครสมาชิกและสร้างโปรไฟล์สำเร็จ!');
        }
    } catch (error) {
        alert("เกิดข้อผิดพลาดด้านความปลอดภัย: " + error.message);
    }
};

window.logout = () => { signOut(auth); };

// ตรวจสอบสถานะการเชื่อมต่อผู้ใช้แบบเรียลไทม์
onAuthStateChanged(auth, (user) => {
    if (user) {
        get(ref(db, 'users/' + user.uid)).then((snapshot) => {
            if (snapshot.exists()) {
                currentUserData = snapshot.val();
                if (currentUserData.role === 'admin') {
                    window.switchView('adminView');
                    loadAdminData();
                } else {
                    window.switchView('studentView');
                    currentRoomId = currentUserData.classroom;
                    document.getElementById('studentRoomName').innerText = `ห้อง: ${currentRoomId.replace('-', '/')}`;
                    loadStudentRoom();
                }
            } else {
                // ตัวจัดการอัตโนมัติ: ถ้าเป็นแอดมินคนแรกแต่ยังไม่มีใน Node users ระบบจะสร้าง Role ให้ทันที
                if(user.email === 'admin@admin.com'){
                     set(ref(db, 'users/' + user.uid), { role: 'admin', fullname: 'Administrator' });
                     window.switchView('adminView');
                     loadAdminData();
                } else {
                    alert("ไม่พบโครงสร้างข้อมูลผู้ใช้ของคุณ กรุณาสมัครสมาชิกใหม่");
                    signOut(auth);
                }
            }
        }).catch(err => alert("สิทธิ์การเข้าถึงฐานข้อมูลล้มเหลว: " + err.message));
    } else {
        window.switchView('authView');
        currentUserData = null;
    }
});

// --- ระบบของนักเรียน (การขอเพลงและการโหวต) ---
function loadStudentRoom() {
    const roomRef = ref(db, `rooms/${currentRoomId}`);
    checkAndResetRoom(currentRoomId);

    onValue(roomRef, (snapshot) => {
        if (snapshot.exists()) {
            document.getElementById('noRoomAlert').style.display = 'none';
            document.getElementById('songList').style.display = 'flex';
            loadSongs();
        } else {
            document.getElementById('noRoomAlert').style.display = 'block';
            document.getElementById('songList').style.display = 'none';
            document.getElementById('songList').innerHTML = '';
        }
    }, (error) => { console.error(error); });
}

function loadSongs() {
    const songsRef = ref(db, `songs/${currentRoomId}`);
    onValue(songsRef, (snapshot) => {
        const songListDiv = document.getElementById('songList');
        songListDiv.innerHTML = '';
        
        if (snapshot.exists()) {
            const songs = [];
            snapshot.forEach(child => {
                songs.push({ id: child.key, ...child.val() });
            });
            
            // เรียงลำดับโหวตจากสูงไปต่ำ
            songs.sort((a, b) => b.votes - a.votes);

            songs.forEach(song => {
                const isVoted = song.voters && song.voters[auth.currentUser.uid];
                songListDiv.innerHTML += `
                    <div class="song-item">
                        <div class="song-info">
                            <h4>${song.title}</h4>
                            <p><i class="fas fa-microphone"></i> ${song.artist}</p>
                            <p style="font-size:10px; color:#b2bec3;">เสนอโดย: ${song.addedByName || 'นักเรียน'}</p>
                        </div>
                        <button class="vote-btn ${isVoted ? 'voted' : ''}" onclick="voteSong('${song.id}')">
                            <i class="fas fa-chevron-up"></i>
                            <span>${song.votes}</span>
                        </button>
                    </div>
                `;
            });
        } else {
            songListDiv.innerHTML = '<p style="text-align:center; color:#fff; width:100%;">ยังไม่มีรายการขอเพลงในห้องนี้ มาร่วมขอเพลงแรกกันเลย!</p>';
        }
    });
}

window.addSong = async () => {
    const title = document.getElementById('songTitle').value.trim();
    const artist = document.getElementById('songArtist').value.trim();
    if(!title || !artist) return alert("กรุณากรอกข้อมูลเพลงให้ครบถ้วน");

    try {
        await push(ref(db, `songs/${currentRoomId}`), {
            title: title,
            artist: artist,
            addedByUid: auth.currentUser.uid,
            addedByName: currentUserData.fullname,
            votes: 1,
            voters: { [auth.currentUser.uid]: true }
        });

        document.getElementById('songTitle').value = '';
        document.getElementById('songArtist').value = '';
        window.showStudentView();
    } catch (error) {
        alert("ขอเพลงไม่สำเร็จ: " + error.message);
    }
};

window.voteSong = (songId) => {
    const songRef = ref(db, `songs/${currentRoomId}/${songId}`);
    const uid = auth.currentUser.uid;

    runTransaction(songRef, (song) => {
        if (song) {
            if (!song.voters) song.voters = {};
            if (!song.voters[uid]) {
                song.voters[uid] = true;
                song.votes++;
            } else {
                alert("คุณโหวตเพลงนี้ไปแล้ว! สามารถโหวตได้เพลงละ 1 ครั้งเท่านั้น");
            }
        }
        return song;
    }).catch(err => console.error("Vote failed:", err));
};

// --- ระบบของแอดมิน (สร้างห้อง, ลบห้อง, ลบผู้ใช้งาน) ---
window.createRoom = () => {
    let rawRoomName = document.getElementById('newRoomName').value.trim();
    if(!rawRoomName) return alert("กรุณากรอกชื่อห้องเรียนก่อนกดสร้าง");
    
    const roomName = rawRoomName.replace(/\//g, '-'); 
    
    // ตั้งค่าโครงสร้างห้องอัตโนมัติ
    set(ref(db, `rooms/${roomName}`), {
        createdAt: Date.now(),
        lastReset: getThaiDateString()
    }).then(() => {
        alert(`เปิดใช้งานห้อง ${rawRoomName} เรียบร้อยแล้ว`);
        document.getElementById('newRoomName').value = '';
    }).catch((error) => {
        alert("ไม่สามารถสร้างห้องได้เนื่องจาก: " + error.message + " \n\n*คำแนะนำ: ตรวจสอบว่าเปิดสิทธิ์การเข้าถึงแบบ Read/Write ใน Realtime Database Rules หรือยัง*");
    });
};

window.deleteRoom = (roomName) => {
    if(confirm(`คุณแน่ใจหรือไม่ที่จะลบห้อง "${roomName.replace('-', '/')}" และข้อมูลการขอเพลงทั้งหมดในห้องนี้?`)) {
        // ลบห้องและลบเพลงย่อยในห้องทั้งหมดออกอย่างสมบูรณ์แบบอัตโนมัติ
        remove(ref(db, `rooms/${roomName}`))
            .then(() => remove(ref(db, `songs/${roomName}`)))
            .then(() => alert("ลบห้องและประวัติเพลงสำเร็จ"))
            .catch(err => alert("ลบไม่สำเร็จ: " + err.message));
    }
};

window.deleteUser = (uid) => {
    if(confirm('ต้องการลบข้อมูลสิทธิ์ของผู้ใช้นี้ออกจากระบบใช่หรือไม่? นักเรียนคนนี้จะไม่สามารถใช้งานระบบได้อีก')) {
        remove(ref(db, `users/${uid}`))
            .then(() => alert("ลบผู้ใช้งานออกจากฐานข้อมูลเรียบร้อย"))
            .catch(err => alert("ลบไม่สำเร็จ: " + err.message));
    }
};

function loadAdminData() {
    // โหลดและเฝ้าสังเกตรายการห้อง + ปุ่มลบห้อง
    onValue(ref(db, 'rooms'), (snapshot) => {
        const adminRoomList = document.getElementById('adminRoomList');
        adminRoomList.innerHTML = '';
        if (snapshot.exists()) {
            snapshot.forEach(child => {
                adminRoomList.innerHTML += `
                    <div style="display:flex; justify-content:space-between; align-items:center; padding: 8px 5px; border-bottom: 1px solid #eee;">
                        <span style="color:#2d3436; font-weight:500;">ห้อง: ${child.key.replace('-', '/')}</span>
                        <button onclick="deleteRoom('${child.key}')" style="background:#ff7675; color:white; border:none; padding:4px 10px; border-radius:6px; cursor:pointer; font-size:12px;"><i class="fas fa-trash"></i> ลบห้อง</button>
                    </div>
                `;
            });
        } else {
            adminRoomList.innerHTML = '<p style="color:#777; text-align:center;">ยังไม่มีการสร้างห้อง</p>';
        }
    });

    // โหลดข้อมูลรายชื่อผู้ใช้งานเพื่อกดลบ
    onValue(ref(db, 'users'), (snapshot) => {
        const adminUserList = document.getElementById('adminUserList');
        adminUserList.innerHTML = '';
        let hasUsers = false;
        
        if (snapshot.exists()) {
            snapshot.forEach(child => {
                const user = child.val();
                if(user.role !== 'admin') {
                    hasUsers = true;
                    adminUserList.innerHTML += `
                        <div style="display:flex; justify-content:space-between; align-items:center; padding: 8px 5px; border-bottom: 1px solid #eee;">
                            <span style="color:#2d3436; font-size:14px;">${user.fullname} (${user.classroom ? user.classroom.replace('-','/') : 'ไม่ระบุ'}) เลขที่ ${user.studentNo || '-'}</span>
                            <button onclick="deleteUser('${child.key}')" style="background:#ff7675; color:white; border:none; padding:4px 10px; border-radius:6px; cursor:pointer; font-size:12px;"><i class="fas fa-user-slash"></i> ลบ</button>
                        </div>
                    `;
                }
            });
        }
        if(!hasUsers) {
            adminUserList.innerHTML = '<p style="color:#777; text-align:center;">ยังไม่มีนักเรียนสมัครสมาชิกเข้าสู่ระบบ</p>';
        }
    });
}
