export const menuCategories = ['Carnes', 'Aves', 'Entremeses', 'Guarniciones', 'Jugos', 'Gaseosas y cerveza', 'Vinos', 'Cócteles', 'Postres']

export function categoriesWithProducts(products: { category?: string }[]) {
  return [...new Set([...menuCategories, ...products.map((product) => product.category).filter((name): name is string => Boolean(name))])]
}
