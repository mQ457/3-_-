const SERVICE_TYPE_ALIASES = {
  print: "print",
  "3d-print": "print",
  "3dprint": "print",
  printing: "print",
  modeling: "modeling",
  modelling: "modeling",
  model: "modeling",
  scan: "scan",
  scanning: "scan",
};

const ORDER_STATUS_BY_SERVICE = {
  print: ["Оплачен", "Файл проверен", "В очереди", "Печатается", "Пост-обработка", "Готов к выдаче", "Отправлен", "Завершен"],
  modeling: ["Оплачен", "Согласование", "ТЗ утверждено", "В работе", "Готов Черновик", "Правки", "Модель готова", "Отправлен", "Завершен"],
  scan: ["Оплачен", "Ожидание посылки", "Посылка в пути", "Модель получена", "Сканирование", "Печать", "Модель готова", "Отправлен", "Завершен"],
};

function normalizeServiceType(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  return SERVICE_TYPE_ALIASES[raw] || raw;
}

function getAllowedStatuses(serviceType) {
  const normalized = normalizeServiceType(serviceType);
  return ORDER_STATUS_BY_SERVICE[normalized] || [];
}

function isAllowedStatus(serviceType, status) {
  const value = String(status || "").trim();
  if (!value) return false;
  return getAllowedStatuses(serviceType).includes(value);
}

module.exports = {
  ORDER_STATUS_BY_SERVICE,
  normalizeServiceType,
  getAllowedStatuses,
  isAllowedStatus,
};
