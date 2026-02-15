export type CategoryDto = {
  id: string
  name: string
  kind: "income" | "expense"
  icon: string | null
}

export type GetCategoriesResponse = {
  categories: CategoryDto[]
}

export async function getCategories(token: string): Promise<GetCategoriesResponse> {
  const res = await fetch("https://babkin.onrender.com/api/v1/categories", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
  if (!res.ok) {
    throw new Error(`Failed to load categories: ${res.status}`)
  }
  return res.json()
}

export type CreateCategoryBody = {
  name: string
  kind: "income" | "expense"
  icon?: string | null
}

export async function createCategory(token: string, body: CreateCategoryBody): Promise<CategoryDto> {
  const res = await fetch("https://babkin.onrender.com/api/v1/categories", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw new Error(`Failed to create category: ${res.status}`)
  }
  const data = (await res.json()) as { category: CategoryDto }
  return data.category
}
