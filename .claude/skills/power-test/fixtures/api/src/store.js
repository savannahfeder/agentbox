// Appointments, kept in memory.
const appointments = [];
let nextId = 1;

export function list({ from = null } = {}) {
  return appointments.filter((a) => !from || a.start >= from);
}

export function book({ who, start, end }) {
  if (!who || !start || !end) throw new Error('who, start and end are required');
  if (end <= start) throw new Error('an appointment must end after it starts');
  const clash = appointments.find((a) => a.start === start);
  if (clash) throw new Error(`that time is taken by appointment ${clash.id}`);
  const appointment = { id: nextId++, who, start, end };
  appointments.push(appointment);
  return appointment;
}

export function cancel(id) {
  const at = appointments.findIndex((a) => a.id === id);
  if (at < 0) return false;
  appointments.splice(at, 1);
  return true;
}

export function reset() {
  appointments.length = 0;
  nextId = 1;
}
