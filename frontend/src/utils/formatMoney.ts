export const CURRENCIES = [
  { code: "RUB", symbol: "₽", label: "Российский рубль" },
  { code: "BYN", symbol: "Br", label: "Белорусский рубль" },
  { code: "KZT", symbol: "₸", label: "Казахский тенге" },
  { code: "UAH", symbol: "₴", label: "Украинская гривна" },
  { code: "EUR", symbol: "€", label: "Евро" },
  { code: "USD", symbol: "$", label: "Доллар США" },
  { code: "UZS", symbol: "", label: "Узбекский сум" },
  { code: "ILS", symbol: "₪", label: "Израильский шекель" },
  { code: "KGS", symbol: "с", label: "Кыргызский сом" },
  { code: "MDL", symbol: "L", label: "Молдавский лей" },
  { code: "GEL", symbol: "₾", label: "Грузинский лари" },
  { code: "AZN", symbol: "₼", label: "Азербайджанский манат" },
  { code: "AMD", symbol: "֏", label: "Армянский драм" },
  { code: "TRY", symbol: "₺", label: "Турецкая лира" },
  { code: "CAD", symbol: "$", label: "Канадский доллар" },
  { code: "TJS", symbol: "ЅМ", label: "Таджикский сомони" },
  { code: "TMT", symbol: "m", label: "Туркменский манат" },
  { code: "AED", symbol: "د.إ", label: "Дирхам ОАЭ" },
  { code: "RSD", symbol: "дин", label: "Сербский динар" },
  { code: "AUD", symbol: "$", label: "Австралийский доллар" },
  { code: "CZK", symbol: "Kč", label: "Чешская крона" },
  { code: "GBP", symbol: "£", label: "Британский фунт" },
  { code: "PLN", symbol: "zł", label: "Польский злотый" },
  { code: "MNT", symbol: "₮", label: "Монгольский тугрик" },
  { code: "ARS", symbol: "$", label: "Аргентинское песо" },
  { code: "CNY", symbol: "¥", label: "Китайский юань" },
  { code: "VND", symbol: "₫", label: "Вьетнамский донг" },
  { code: "BGN", symbol: "лв", label: "Болгарский лев" },
  { code: "CHF", symbol: "CHF", label: "Швейцарский франк" },
  { code: "UYU", symbol: "$", label: "Уругвайское песо" },
  { code: "BRL", symbol: "R$", label: "Бразильский реал" },
  { code: "MXN", symbol: "$", label: "Мексиканское песо" },
  { code: "KRW", symbol: "₩", label: "Южнокорейская вона" },
  { code: "NZD", symbol: "$", label: "Новозеландский доллар" },
  { code: "JPY", symbol: "¥", label: "Японская иена" },
  { code: "IDR", symbol: "Rp", label: "Индонезийская рупия" },
  { code: "THB", symbol: "฿", label: "Тайский бат" },
] as const

export type CurrencyCode = (typeof CURRENCIES)[number]["code"]

export function normalizeCurrency(code: string | undefined | null): CurrencyCode {
  const upper = (code ?? "").toUpperCase()
  const found = CURRENCIES.find((c) => c.code === upper)
  return (found?.code ?? "RUB") as CurrencyCode
}

function getSymbol(code: CurrencyCode): string {
  const found = CURRENCIES.find((c) => c.code === code)
  const symbol = found?.symbol?.trim() ?? ""
  return symbol || code
}

export function formatMoney(value: number, currency: string): string {
  const code = normalizeCurrency(currency)
  const hasFraction = Math.round(value * 100) % 100 !== 0
  const formatter = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: hasFraction ? 2 : 0,
  })
  const formatted = formatter.format(value).replace(/,/g, " ")
  return `${formatted} ${getSymbol(code)}`
}

export function formatMoneyIntl(value: number, currency: string, locale = "ru-RU"): string {
  const code = normalizeCurrency(currency)
  const hasFraction = Math.round(value * 100) % 100 !== 0
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: code,
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: hasFraction ? 2 : 0,
  }).format(value)
}
