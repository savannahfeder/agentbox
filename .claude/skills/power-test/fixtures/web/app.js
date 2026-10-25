const API = 'http://localhost:3000';

async function load() {
  const res = await fetch(`${API}/appointments`);
  const appointments = await res.json();
  const list = document.getElementById('list');
  list.innerHTML = appointments.map((a) => `<li><strong>${a.who}</strong> ${a.start} to ${a.end}</li>`).join('');
}

document.getElementById('book').addEventListener('click', async () => {
  const who = prompt('Who?');
  const start = prompt('Start (2026-11-02T09:00)?');
  const end = prompt('End?');
  await fetch(`${API}/appointments`, { method: 'POST', body: JSON.stringify({ who, start, end }) });
  load();
});

load();
