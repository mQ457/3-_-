const HANDOFF_MESSAGE =
  "Я передал ваше обращение консультанту — администратор уже видит запрос в системе. Специалист ответит в этом чате в ближайшее время. Пожалуйста, оставайтесь на связи.";

const FALLBACK_MESSAGE =
  "Спасибо за вопрос! К сожалению, я не могу дать точный ответ автоматически. Я уже передал обращение консультанту — администратор получил уведомление и ответит здесь, как только освободится.";

const REPEAT_HANDOFF_MESSAGE =
  "Ваш запрос уже у консультанта. Пока ждёте ответ, могу подсказать по типовым темам: «как оформить заказ», «хочу напечатать чехол», «PLA или PETG», «мои заказы» или «доставка».";

const ERROR_SITE_MESSAGE =
  "Похоже, на сайте возникла техническая ошибка. Я уже передал информацию администратору — консультант проверит ситуацию и ответит вам в этом чате.\n\nПока можно попробовать:\n1) обновить страницу (Ctrl+F5);\n2) выйти и войти снова;\n3) открыть сайт с главной страницы.\n\nЕсли ошибка повторится — напишите, что именно нажимали, это ускорит решение.";

const PRODUCT_HINTS = [
  {
    keywords: ["чехол", "бампер", "накладк", "кейс"],
    label: "чехол или накладку",
    service: "3Д-печать",
    servicePath: "print-step-3.html",
    tech: "FDM",
    material: "TPU (гибкий) или PETG (прочнее)",
    needsFile: true,
    altService: "моделирование",
    altPath: "print-step-2.html",
  },
  {
    keywords: ["креплен", "держател", "кронштейн", "клипс", "зажим"],
    label: "крепление или держатель",
    service: "3Д-печать",
    servicePath: "print-step-3.html",
    tech: "FDM",
    material: "PETG или ABS",
    needsFile: true,
    altService: "моделирование",
    altPath: "print-step-2.html",
  },
  {
    keywords: ["прототип", "макет", "стенд", "образец"],
    label: "прототип или макет",
    service: "3Д-печать",
    servicePath: "print-step-3.html",
    tech: "FDM",
    material: "PLA или PETG",
    needsFile: true,
    altService: "моделирование",
    altPath: "print-step-2.html",
  },
  {
    keywords: ["миниатюр", "фигурк", "бюст", "статуэтк"],
    label: "миниатюру или фигурку",
    service: "3Д-печать",
    servicePath: "print-step-3.html",
    tech: "SLA",
    material: "фотополимерная смола",
    needsFile: true,
    altService: "моделирование",
    altPath: "print-step-2.html",
  },
  {
    keywords: ["детал", "запчаст", "шестерн", "корпус"],
    label: "функциональную деталь",
    service: "3Д-печать",
    servicePath: "print-step-3.html",
    tech: "FDM или SLS",
    material: "PETG, PA12 или ABS — по нагрузке",
    needsFile: true,
    altService: "моделирование",
    altPath: "print-step-2.html",
  },
  {
    keywords: ["копи", "дубликат", "аналог", "такую же"],
    label: "копию существующего объекта",
    service: "сканирование",
    servicePath: "print-step-1.html",
    tech: "3Д-сканирование",
    material: "—",
    needsFile: false,
    altService: "3Д-печать после скана",
    altPath: "print-step-3.html",
  },
];

const RESPONSE_CATEGORIES = [
  {
    id: "greeting",
    patterns: [
      /^(привет|здравств|добр(ый|ое|ого|ая)|hello|hi|хай|салют)/i,
      /добр(ый|ое|ого)\s+(день|вечер|утро)/i,
      /как\s+дела/i,
      /вы\s+тут/i,
    ],
    responses: [
      "Здравствуйте! Я ИИ-помощник сервиса 3Д-технологий. Могу подсказать, как оформить печать, моделирование или сканирование, помочь с навигацией по сайту и подобрать материал. Напишите, что хотите сделать — например: «хочу напечатать чехол».",
      "Добрый день! Рад помочь. Опишите задачу своими словами — подскажу услугу, материал и куда нажать на сайте.",
    ],
  },
  {
    id: "site_errors",
    action: "handoff",
    patterns: [
      /внутренн.*ошибк/i,
      /ошибк.*сервер/i,
      /не\s+работает\s+(сайт|страниц|кнопк|форма)/i,
      /сайт\s+(не\s+работ|сломал|глюч)/i,
      /не\s+могу\s+(войти|зарегистр|оформить|загрузить)/i,
      /белый\s+экран/i,
      /404|не\s+найден/i,
      /долго\s+груз/i,
      /зависа/i,
    ],
    responses: [ERROR_SITE_MESSAGE],
  },
  {
    id: "product_intent",
    patterns: [
      /(хочу|надо|нужно|можно|помогите|помоги|сделать|напечатать|напечат|заказать).{0,50}(чехол|детал|креплен|держател|макет|прототип|фигурк|миниатюр|копи|накладк|бампер|корпус)/i,
      /(чехол|детал|креплен|макет|фигурк).{0,40}(напечат|печат|сделать|заказать)/i,
    ],
    handler: "product_intent",
  },
  {
    id: "service_printing",
    patterns: [
      /как.{0,40}(заказать|оформить|сделать).{0,40}(3д\s*печат|печать|напечат)/i,
      /(заказать|оформить|сделать).{0,40}(3д\s*печат|печать|напечат)/i,
      /3д\s*печат|3d\s*print|напечат|распечат/i,
      /печат(ь|и|а|ать).{0,30}(детал|модел|файл|заказ)/i,
      /файл.{0,30}(stl|obj|3mf|печать)/i,
      /есть\s+(stl|obj|3mf|модель|файл)/i,
    ],
    responses: [
      "Для 3Д-печати:\n\n1) На главной нажмите карточку **«3Д печать»** → «Подробнее» (или кнопку **«Заказать»**).\n2) Загрузите файл: STL, OBJ, AMF, 3MF или FBX.\n3) Выберите технологию, материал, цвет, количество и толщину слоя.\n4) Проверьте расчёт и нажмите **«Перейти к оплате»**.\n5) Укажите доставку и оплатите — заказ появится в **«Мои заказы»**.",
      "Если файл уже готов — это услуга **3Д-печать**. Загрузите модель, выберите материал (PLA для макетов, PETG для прочных деталей, TPU для гибких чехлов) и оформите заказ.",
    ],
  },
  {
    id: "service_modeling",
    patterns: [
      /как.{0,40}(заказать|оформить|сделать).{0,40}(моделирован|модель|3д\s*модель)/i,
      /моделирован|смодел|3д\s*модел|3d\s*model/i,
      /нужн[ао]?\s+(модель|3д\s*модель)/i,
      /нет\s+(модел|файл)/i,
      /черт[её]ж|эскиз|рисунок|фото.{0,20}модел/i,
    ],
    responses: [
      "Для **моделирования**:\n\n1) Главная → карточка **«Моделирование»** → «Подробнее».\n2) Шаг 1 — выберите тип задачи и опишите, что нужно сделать.\n3) Шаг 2 — приложите фото, эскиз или размеры.\n4) Шаг 3 — укажите параметры (размер, точность).\n5) Шаг 4 — телефон для связи → **«Отправить заявку»**.\n\nЦену назначит менеджер после оценки задачи.",
      "Моделирование подходит, если нет готового 3Д-файла. Чем подробнее описание и приложения — тем точнее результат.",
    ],
  },
  {
    id: "service_scanning",
    patterns: [
      /сканирован|сканировать|3д\s*скан|оцифров/i,
      /реальн(ый|ого|ую)\s+объект/i,
      /образец|посылк.{0,30}детал/i,
    ],
    responses: [
      "Для **сканирования**:\n\n1) Главная → **«Сканирование»** → «Подробнее».\n2) Пройдите 4 шага заявки: тип объекта, описание, параметры, контакты.\n3) Отправьте заявку — менеджер назначит цену.\n4) После оплаты отправьте образец по инструкции из **«Мои заказы»**.\n\nРезультат — цифровая 3Д-модель, при желании можно сразу заказать печать.",
    ],
  },
  {
    id: "site_navigation",
    patterns: [
      /где\s+(кнопк|раздел|меню|находится)/i,
      /куда\s+(нажать|перейти|идти|жать)/i,
      /что\s+делает\s+кнопк/i,
      /как\s+пользов/i,
      /главн(ая|ой|ую)\s+страниц/i,
      /landing|шапк|меню\s+слева/i,
    ],
    responses: [
      "Краткая карта сайта:\n\n• **Главная** — выбор услуги: печать, моделирование, сканирование.\n• **Заказать** — быстрый переход к 3Д-печати.\n• **Личный кабинет** — профиль, заказы, поддержка.\n• Меню слева: **Профиль**, **Мои заказы**, **Адрес доставки**, **Оплата**.\n\nНапишите, что именно ищете — укажу точную кнопку.",
      "На главной три карточки услуг с кнопкой «Подробнее». В шапке — «Заказать» и «Личный кабинет». Уточните раздел — подскажу пошагово.",
    ],
  },
  {
    id: "how_to_order",
    patterns: [
      /как\s+(оформ|сделать|заказать|разместить)/i,
      /с\s+чего\s+начать/i,
      /пошагов/i,
    ],
    responses: [
      "С чего начать:\n\n• **Есть 3Д-файл** → 3Д-печать.\n• **Нет файла, есть описание/фото** → моделирование.\n• **Есть реальный объект** → сканирование.\n\nНа главной выберите нужную карточку и следуйте шагам. Без аккаунта сайт предложит регистрацию.",
    ],
  },
  {
    id: "login_register",
    patterns: [/вход|войти|логин|регистр|создать\s+аккаунт|зарегистр|парол/i, /личн(ый|ого)\s+кабинет/i],
    responses: [
      "**Вход и регистрация** — страница login.html (открывается при нажатии «Личный кабинет» без аккаунта).\n\n• Вход: телефон + пароль.\n• Регистрация: ФИО, телефон, пароль, согласие на обработку данных.\n\nПосле регистрации можно продолжить оформление заказа с того же места.",
    ],
  },
  {
    id: "profile",
    patterns: [/профил/i, /изменить\s+(фио|имя|телефон|email)/i, /личн(ые|ых)\s+данн/i],
    responses: [
      "**Профиль** — раздел «Личный кабинет» (profile.html). Там редактируются ФИО, телефон, email и блок **«Техподдержка»** с чатом. Кнопка **«Сохранить»** — внизу формы.",
    ],
  },
  {
    id: "order_status",
    patterns: [/статус\s+заказ/i, /мои\s+заказ/i, /отслеж/i, /номер\s+заказ/i],
    responses: [
      "**Мои заказы** — в меню личного кабинета. Там номер, сумма, статус и доставка. Нажмите **круглую стрелку** справа — откроются детали. Для срочного вопроса укажите номер заказа.",
    ],
  },
  {
    id: "delivery",
    patterns: [/доставк/i, /адрес/i, /пвз|пункт\s+выдач/i, /почт(а|ы)\s+росс/i, /курьер/i],
    responses: [
      "**Адрес доставки** — в меню личного кабинета. Выберите пункт выдачи на карте или введите адрес вручную. Адрес подтянется при оформлении заказа.",
    ],
  },
  {
    id: "payment",
    patterns: [/оплат/i, /карт(а|у|ой)/i, /способ\s+оплат/i],
    responses: [
      "**Оплата** — раздел в меню или на странице подтверждения заказа. Можно добавить карту и выбрать по умолчанию. При ошибке оплаты — напишите текст ошибки, передам консультанту.",
    ],
  },
  {
    id: "materials",
    patterns: [/pla\b|abs\b|petg|tpu|nylon|материал/i, /смол|resin/i, /из\s+чего\s+печат/i],
    responses: [
      "Материалы кратко:\n\n• **PLA** — макеты, недорого.\n• **PETG** — прочность и влагостойкость, универсальный выбор.\n• **TPU** — гибкие чехлы и накладки.\n• **ABS** — термостойкость.\n• **Смола** — миниатюры, высокая детализация.\n\nНапишите, что печатаете — подберу точнее.",
    ],
  },
  {
    id: "technologies",
    patterns: [/\bfdm\b|\bsla\b|\bsls\b|\bdlp\b/i, /технолог/i, /тип\s+печат/i],
    responses: [
      "Технологии:\n\n• **FDM** — пластик слой за слоем, доступно и универсально.\n• **SLA/DLP** — смола, отличная детализация.\n• **SLS** — порошок, прочные детали сложной формы.\n\nДля прототипов — FDM, для мелких деталей — SLA.",
    ],
  },
  {
    id: "choice_help",
    patterns: [/что\s+(выбрать|лучше|подойд)/i, /посовет/i, /рекоменд/i, /помог(ите|и)\s+выбрать/i],
    action: "clarify",
    responses: [
      "Чтобы порекомендовать точнее, ответьте на три вопроса:\n\n1) Деталь несёт нагрузку или декоративная?\n2) Примерный размер?\n3) Есть готовый 3Д-файл или нужно сделать модель?\n\nПока ориентир: прототип → FDM + PLA/PETG; чехол → TPU; миниатюра → SLA + смола.",
    ],
  },
  {
    id: "pricing",
    patterns: [/цен(а|у|ы|ой)|стоим|сколько\s+сто/i, /прайс|расч[её]т/i],
    responses: [
      "Стоимость **3Д-печати** считается автоматически после загрузки файла и выбора параметров. Для **моделирования** и **сканирования** цену назначает менеджер после заявки. Итог виден перед оплатой или в «Мои заказы».",
    ],
  },
  {
    id: "support_chat",
    patterns: [/техподдерж|поддержк/i, /обращен/i, /чат/i, /консультант/i],
    responses: [
      "Вы уже в чате техподдержки — в личном кабинете, блок **«Техподдержка»**. Я отвечаю первым; если нужен живой специалист — напишите «нужен консультант», и я передам обращение администратору.",
    ],
  },
  {
    id: "thanks",
    patterns: [/спасиб|благодар|thanks|понятно|разобрался|помог/i],
    responses: [
      "Пожалуйста! Если появятся ещё вопросы — пишите. Для сложных случаев подключу консультанта.",
    ],
  },
  {
    id: "handoff_manual",
    patterns: [
      /возврат|refund/i,
      /спор|претенз/i,
      /верните\s+день/i,
      /ошибк.*(оплат|плат)/i,
      /жалоб/i,
    ],
    action: "handoff",
    responses: [HANDOFF_MESSAGE],
  },
];

const MIN_MATCH_SCORE = 4;

function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/(.)\1+/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreCategory(text, category) {
  let score = 0;
  for (const pattern of category.patterns || []) {
    if (pattern.test(text)) score += 5;
  }
  return score;
}

function pickRandom(items) {
  if (!items || items.length === 0) return "";
  return items[Math.floor(Math.random() * items.length)];
}

function detectProductHint(text) {
  for (const hint of PRODUCT_HINTS) {
    if (hint.keywords.some((kw) => text.includes(kw))) {
      return hint;
    }
  }
  return null;
}

function hasPrintIntent(text) {
  return /(хочу|надо|нужно|можно|помогите|помоги|сделать|напечатать|напечат|заказать|изготов)/i.test(text);
}

function buildProductIntentReply(text) {
  const hint = detectProductHint(text);
  if (!hint) return null;

  const hasFile = /(есть|готов|stl|obj|3mf|файл|модель)/i.test(text);
  const lines = [
    `Отличная задача — **${hint.label}**! Вот что рекомендую:`,
    "",
    `**Услуга:** ${hint.service === "сканирование" ? "3Д-сканирование" : hint.service}`,
    `**Технология:** ${hint.tech}`,
  ];
  if (hint.material && hint.material !== "—") {
    lines.push(`**Материал:** ${hint.material}`);
  }
  lines.push("");

  if (hint.service === "сканирование") {
    lines.push("**Как оформить:**");
    lines.push("1) Главная → **«Сканирование»** → «Подробнее».");
    lines.push("2) Заполните заявку и отправьте образец после оплаты.");
    lines.push("3) После скана можно заказать печать копии.");
  } else if (hasFile) {
    lines.push("**Как оформить:**");
    lines.push(`1) Главная → **«3Д печать»** (или кнопка «Заказать»).`);
    lines.push("2) Загрузите файл и выберите указанные параметры.");
    lines.push("3) Подтвердите заказ и оплатите.");
  } else {
    lines.push("**Как оформить:**");
    lines.push(`1) Если есть 3Д-файл — **3Д-печать** (${hint.servicePath}).`);
    lines.push(`2) Если файла нет — **${hint.altService}** (${hint.altPath}): опишите задачу и размеры.`);
    lines.push("3) Менеджер уточнит детали и рассчитает стоимость.");
    lines.push("");
    lines.push("Уточните, пожалуйста: есть ли у вас готовый файл и примерные размеры изделия?");
  }

  return lines.join("\n");
}

function resolveStubReply(userMessage) {
  const text = normalizeText(userMessage);
  if (!text) {
    return { action: "handoff", message: FALLBACK_MESSAGE };
  }

  if (hasPrintIntent(text) || detectProductHint(text)) {
    const productReply = buildProductIntentReply(text);
    if (productReply) {
      const needsClarify = !/(есть|готов|stl|obj|3mf|файл|размер|мм|см)/i.test(text) && detectProductHint(text)?.needsFile;
      return {
        action: needsClarify ? "clarify" : "answer",
        message: productReply,
        categoryId: "product_intent",
      };
    }
  }

  let bestCategory = null;
  let bestScore = 0;

  for (const category of RESPONSE_CATEGORIES) {
    const score = scoreCategory(text, category);
    if (score > bestScore) {
      bestScore = score;
      bestCategory = category;
    }
  }

  if (!bestCategory || bestScore < MIN_MATCH_SCORE) {
    return { action: "handoff", message: FALLBACK_MESSAGE };
  }

  if (bestCategory.handler === "product_intent") {
    const productReply = buildProductIntentReply(text);
    if (productReply) {
      return { action: "answer", message: productReply, categoryId: "product_intent" };
    }
  }

  const action =
    bestCategory.action === "handoff" ? "handoff" : bestCategory.action === "clarify" ? "clarify" : "answer";
  const message = pickRandom(bestCategory.responses);

  return { action, message, categoryId: bestCategory.id };
}

function getStubThinkingDelayMs() {
  return 700 + Math.floor(Math.random() * 1500);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function simulateStubThinking() {
  await delay(getStubThinkingDelayMs());
}

module.exports = {
  resolveStubReply,
  simulateStubThinking,
  buildProductIntentReply,
  FALLBACK_MESSAGE,
  REPEAT_HANDOFF_MESSAGE,
  HANDOFF_MESSAGE,
};
