export type ApiAccount = {
  id: string
  name: string
  type: string
  currency: string
  balance: number
}

export type GetAccountsResponse = {
  accounts: ApiAccount[]
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export async function getAccounts(token: string): Promise<GetAccountsResponse> {
  const url = "https://babkin.onrender.com/api/v1/accounts"
  let attempt = 0

  // retry once on network error or 5xx
  // eslint-disable-next-line no-constant-condition
  while (true) {
    let res: Response
    try {
      res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
    } catch (err) {
      if (attempt === 0) {
        attempt += 1
        await delay(1000)
        continue
      }
      if (err instanceof Error) throw err
      throw new Error("Network error")
    }

    if (res.status === 401 || res.status === 403) {
      const text = await res.text().catch(() => "")
      throw new Error(`GET /accounts failed: ${res.status} ${res.statusText} ${text}`)
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "")
      if (res.status >= 500 && attempt === 0) {
        attempt += 1
        await delay(1000)
        continue
      }
      throw new Error(`GET /accounts failed: ${res.status} ${res.statusText} ${text}`)
    }

    return res.json()
  }
}

export type CreateAccountBody = {
  name: string
  type: string
  currency: string
  balance?: number
}

export type UpdateAccountBody = Partial<CreateAccountBody>

export async function updateAccount(token: string, id: string, body: UpdateAccountBody): Promise<ApiAccount> {
  const res = await fetch(`https://babkin.onrender.com/api/v1/accounts/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw new Error(`Failed to update account: ${res.status}`)
  }
  const data = (await res.json()) as { account: ApiAccount }
  return data.account
}

export async function deleteAccount(token: string, id: string): Promise<void> {
  const res = await fetch(`https://babkin.onrender.com/api/v1/accounts/${id}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
  if (!res.ok) {
    throw new Error(`Failed to delete account: ${res.status}`)
  }
}

export async function createAccount(token: string, body: CreateAccountBody): Promise<ApiAccount> {
  const res = await fetch("https://babkin.onrender.com/api/v1/accounts", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw new Error(`Failed to create account: ${res.status}`)
  }
  const data = (await res.json()) as { account: ApiAccount }
  return data.account
}
