export const CURRENCIES = [
  { code: "RUB", symbol: "₽", label: "Российский рубль" },
  { code: "USD", symbol: "$", label: "Доллар США" },
  { code: "EUR", symbol: "€", label: "Евро" },
  { code: "GBP", symbol: "£", label: "Фунт стерлингов" },
  { code: "CNY", symbol: "¥", label: "Китайский юань" },
  { code: "KZT", symbol: "₸", label: "Казахстанский тенге" },
  { code: "BYN", symbol: "Br", label: "Белорусский рубль" },
  { code: "UAH", symbol: "₴", label: "Украинская гривна" },
  { code: "AED", symbol: "د.إ", label: "Дирхам ОАЭ" },
  { code: "TRY", symbol: "₺", label: "Турецкая лира" },
] as const

export type CurrencyCode = (typeof CURRENCIES)[number]["code"]

export function normalizeCurrency(code: string | undefined | null): CurrencyCode {
  const upper = (code ?? "").toUpperCase()
  const found = CURRENCIES.find((c) => c.code === upper)
  return (found?.code ?? "RUB") as CurrencyCode
}

function getSymbol(code: CurrencyCode): string {
  const found = CURRENCIES.find((c) => c.code === code)
  return found?.symbol ?? "₽"
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
