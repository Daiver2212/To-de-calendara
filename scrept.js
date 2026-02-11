document.addEventListener("DOMContentLoaded", async () => {

  /* ================= ЧАСЫ (первые) ================= */
  startClock();
  function startClock() {
    const months = ["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"];
    const weekdays = ["Вс","Пн","Вт","Ср","Чт","Пт","Сб"];

    const hhEl = document.querySelector(".HH");
    const mmEl = document.querySelector(".MM");
    const dateEl = document.querySelector(".date");

    function tick() {
      const now = new Date();
      if (hhEl) hhEl.textContent = String(now.getHours()).padStart(2, "0");
      if (mmEl) mmEl.textContent = String(now.getMinutes()).padStart(2, "0");
      if (dateEl) dateEl.textContent = `${weekdays[now.getDay()]}, ${now.getDate()} ${months[now.getMonth()]}`;
      setTimeout(tick, 1000 - now.getMilliseconds());
    }
    tick();
  }

  /* ================= UI ================= */
  const registerSection = document.getElementById("registerSection");
  const appSection = document.getElementById("appSection");
  const regEmail = document.getElementById("regEmail");
  const registerBtn = document.getElementById("registerBtn");
  const registerStatus = document.getElementById("registerStatus");

  const taskName = document.getElementById("taskName");
  const taskDate = document.getElementById("taskDate");
  const taskTime = document.getElementById("taskTime");
  const addBtn = document.querySelector(".add_task");
  const list = document.querySelector(".task_list");
  const clearBtn = document.getElementById("clearAllTasks");

  // Защита: если вдруг не найдено поле времени
  if (!taskTime) {
    console.error("Не найден #taskTime. Проверь HTML id='taskTime'");
  }

  /* ================= MODAL ================= */
  const modal = document.getElementById("taskModal");
  const modalName = document.getElementById("modalName");
  const modalTime = document.getElementById("modalTime");
  const modalDate = document.getElementById("modalDate");
  const modalCloseBtn = document.getElementById("modalCloseBtn");

  function openModal(task) {
    modalName.textContent = task.name || "—";
    modalTime.textContent = task.time || "—"; // ⏰ время первым
    modalDate.textContent = task.date || "—";
    modal.classList.remove("hidden");
  }
  function closeModal(){ modal.classList.add("hidden"); }
  modalCloseBtn?.addEventListener("click", closeModal);
  modal?.addEventListener("click", (e) => { if (e.target?.dataset?.close === "1") closeModal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });

  /* ================= ВВОД ДАТЫ (ДДММ -> ДД.ММ) ================= */
  taskDate?.addEventListener("input", () => {
    let digits = (taskDate.value || "").replace(/\D/g, "");
    if (digits.length > 4) digits = digits.slice(0, 4);
    taskDate.value = digits.length <= 2 ? digits : digits.slice(0, 2) + "." + digits.slice(2);
  });

  /* ================= FIREBASE ================= */
  const firebaseConfig = {
    apiKey: "AIzaSyCqhc22NWeYrbm8c461Bnio4-Nj6r1Zs58",
    authDomain: "to-do-calendar-7a21d.firebaseapp.com",
    projectId: "to-do-calendar-7a21d",
    storageBucket: "to-do-calendar-7a21d.firebasestorage.app",
    messagingSenderId: "334708917123",
    appId: "1:334708917123:web:799c27d742ee4d5cd26cb6"
  };

  if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);

  const auth = firebase.auth();
  const db = firebase.firestore();

  /* ================= MAGIC LINK ================= */
  const ACTION_URL = window.location.origin + window.location.pathname;

  // Завершение входа по ссылке
  if (auth.isSignInWithEmailLink(window.location.href)) {
    let email = localStorage.getItem("emailForSignIn") || "";
    if (!email) email = prompt("Подтверди email для входа:");
    if (email) {
      try {
        await auth.signInWithEmailLink(email, window.location.href);
        localStorage.removeItem("emailForSignIn");
      } catch (e) {
        console.error(e);
        if (registerStatus) registerStatus.textContent = "Ошибка входа по ссылке 😢";
      }
    }
  }

  registerBtn?.addEventListener("click", async () => {
    const email = (regEmail?.value || "").trim();
    if (!isValidEmail(email)) {
      if (registerStatus) registerStatus.textContent = "Введи корректный email";
      return;
    }

    if (registerStatus) registerStatus.textContent = "Отправляю ссылку на почту...";

    try {
      await auth.sendSignInLinkToEmail(email, { url: ACTION_URL, handleCodeInApp: true });
      localStorage.setItem("emailForSignIn", email);
      if (registerStatus) registerStatus.textContent = "Готово! Проверь почту 📩 и перейди по ссылке.";
    } catch (e) {
      console.error(e);
      if (registerStatus) registerStatus.textContent = "Не получилось отправить ссылку 😢";
    }
  });

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  /* ================= TASKS (Firestore) ================= */
  let unsubscribe = null;

  auth.onAuthStateChanged((user) => {
    if (!user) {
      registerSection?.classList.remove("hidden");
      appSection?.classList.add("hidden");
      if (unsubscribe) unsubscribe();
      return;
    }

    registerSection?.classList.add("hidden");
    appSection?.classList.remove("hidden");
    startRealtimeTasks(user.uid);
  });

  function startRealtimeTasks(uid) {
    if (unsubscribe) unsubscribe();

    unsubscribe = db
      .collection("users").doc(uid)
      .collection("tasks")
      .orderBy("createdAt", "asc")
      .onSnapshot((snap) => {
        list.innerHTML = "";
        snap.forEach((doc) => {
          list.appendChild(createTaskElement(uid, doc.id, doc.data()));
        });
      }, (err) => console.error(err));
  }

  addBtn?.addEventListener("click", async () => {
    const user = auth.currentUser;
    if (!user) return;

    const name = (taskName?.value || "").trim();
    if (!name) return;

    // ⏰ время первым
    const time = normalizeTime(taskTime?.value);
    const date = normalizeDateNoYear(taskDate?.value);

    if (!time) {
      alert("Укажи время (например 14:30)");
      return;
    }
    if ((taskDate?.value || "").trim() && !date) {
      alert("Неверная дата. Формат: ДД.ММ (например 12.03)");
      return;
    }

    try {
      await db.collection("users").doc(user.uid).collection("tasks").add({
        name,
        time,              // ⏰ всегда HH:MM
        date: date || "",
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      taskName.value = "";
      taskTime.value = "";
      taskDate.value = "";
      taskName.focus();
    } catch (e) {
      console.error(e);
      alert("Ошибка сохранения задачи");
    }
  });

  function createTaskElement(uid, docId, task) {
    const el = document.createElement("div");
    el.className = "task";

    const when = `${task.time || ""} ${task.date || ""}`.trim(); // ⏰ время первым

    el.innerHTML = `
      <div class="checkbox" data-id="${docId}"></div>
      <div class="content">
        <h2 class="task__name">${escapeHtml(task.name || "")}</h2>
        <span class="condition inprocess">${escapeHtml(when || "—")}</span>
      </div>
    `;

    el.querySelector(".content").addEventListener("click", () => {
      openModal({ name: task.name || "", time: task.time || "", date: task.date || "" });
    });

    el.querySelector(".checkbox").addEventListener("click", async () => {
      try {
        await db.collection("users").doc(uid).collection("tasks").doc(docId).delete();
      } catch (e) {
        console.error(e);
        alert("Ошибка удаления");
      }
    });

    return el;
  }

  clearBtn?.addEventListener("click", async () => {
    const user = auth.currentUser;
    if (!user) return;

    if (!confirm("Ты точно хочешь удалить ВСЕ задачи?")) return;

    try {
      const snap = await db.collection("users").doc(user.uid).collection("tasks").get();
      const batch = db.batch();
      snap.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
    } catch (e) {
      console.error(e);
      alert("Ошибка при удалении задач");
    }
  });

  /* ================= VALIDATION ================= */

  // ✅ Дата: учитывает реальные дни в месяце
  function normalizeDateNoYear(str) {
    const digits = (str || "").replace(/\D/g, "");
    if (digits.length < 4) return "";

    const day = Number(digits.slice(0, 2));
    const month = Number(digits.slice(2, 4));

    if (!Number.isFinite(day) || !Number.isFinite(month)) return "";
    if (month < 1 || month > 12) return "";
    if (day < 1) return "";

    const year = new Date().getFullYear();
    const daysInMonth = new Date(year, month, 0).getDate();
    if (day > daysInMonth) return "";

    return `${String(day).padStart(2, "0")}.${String(month).padStart(2, "0")}`;
  }

  // ✅ Время: принимает HH:MM и HH:MM:SS (и приводит к HH:MM)
  function normalizeTime(str) {
    let s = (str || "").trim();
    if (!s) return "";

    // иногда встречается "14:30:00" — режем секунды
    const parts = s.split(":");
    if (parts.length >= 2) {
      const hh = Number(parts[0]);
      const mm = Number(parts[1]);

      if (!Number.isFinite(hh) || !Number.isFinite(mm)) return "";
      if (hh < 0 || hh > 23) return "";
      if (mm < 0 || mm > 59) return "";

      return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
    }

    return "";
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g,"&amp;")
      .replace(/</g,"&lt;")
      .replace(/>/g,"&gt;")
      .replace(/"/g,"&quot;")
      .replace(/'/g,"&#039;");
  }

});
