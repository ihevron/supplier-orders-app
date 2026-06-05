import { useEffect, useMemo, useState } from 'react'
import './App.css'

const STORAGE_KEY = 'hevron-supplier-orders-v1'

const initialSuppliers = [
  {
    id: 'supplier-1',
    name: 'ספק לדוגמה',
    products: [
      {
        id: 'product-1',
        name: 'סלט חצילים 250 גרם',
        cartonQty: 12,
        price: 8.5,
        orderQty: 0,
      },
      {
        id: 'product-2',
        name: 'טחינה 500 גרם',
        cartonQty: 6,
        price: 12,
        orderQty: 0,
      },
    ],
  },
  {
    id: 'supplier-2',
    name: 'ספק נוסף',
    products: [
      {
        id: 'product-3',
        name: 'חומוס 1 ק״ג',
        cartonQty: 8,
        price: 14,
        orderQty: 0,
      },
      {
        id: 'product-4',
        name: 'מטבוחה 500 גרם',
        cartonQty: 10,
        price: 9.75,
        orderQty: 0,
      },
    ],
  },
]

function parseNumber(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0
  }

  const number = Number(String(value).replace(',', '.').trim())
  return Number.isFinite(number) ? number : 0
}

function formatCurrency(value) {
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
    maximumFractionDigits: 2,
  }).format(value)
}

function App() {
  const [suppliers, setSuppliers] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      return saved ? JSON.parse(saved) : initialSuppliers
    } catch {
      return initialSuppliers
    }
  })
  const [activeSupplierId, setActiveSupplierId] = useState(
    () => suppliers[0]?.id ?? '',
  )

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(suppliers))
  }, [suppliers])

  const activeSupplier = useMemo(
    () => suppliers.find((supplier) => supplier.id === activeSupplierId),
    [activeSupplierId, suppliers],
  )

  const orderTotal = useMemo(() => {
    if (!activeSupplier) {
      return 0
    }

    return activeSupplier.products.reduce(
      (total, product) =>
        total + product.orderQty * product.cartonQty * product.price,
      0,
    )
  }, [activeSupplier])

  function updateOrderQuantity(productId, value) {
    const orderQty = Math.max(0, parseNumber(value))

    setSuppliers((currentSuppliers) =>
      currentSuppliers.map((supplier) => {
        if (supplier.id !== activeSupplierId) {
          return supplier
        }

        return {
          ...supplier,
          products: supplier.products.map((product) =>
            product.id === productId ? { ...product, orderQty } : product,
          ),
        }
      }),
    )
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <p className="eyebrow">חברון שיווק סלטים בע״מ</p>
        <h1>הזמנות ספקים</h1>
      </header>

      <nav className="supplier-tabs" aria-label="ספקים">
        {suppliers.map((supplier) => (
          <button
            key={supplier.id}
            type="button"
            className={supplier.id === activeSupplierId ? 'active' : ''}
            onClick={() => setActiveSupplierId(supplier.id)}
          >
            {supplier.name}
          </button>
        ))}
      </nav>

      {activeSupplier && (
        <section className="supplier-panel">
          <div className="supplier-summary">
            <div>
              <span>ספק נבחר</span>
              <strong>{activeSupplier.name}</strong>
            </div>
            <div>
              <span>סכום הזמנה</span>
              <strong>{formatCurrency(orderTotal)}</strong>
            </div>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>כמות להזמנה</th>
                  <th>שם מוצר</th>
                  <th>מחיר ליחידה</th>
                  <th>כמות בקרטון</th>
                </tr>
              </thead>
              <tbody>
                {activeSupplier.products.map((product) => (
                  <tr key={product.id}>
                    <td>
                      <input
                        type="number"
                        min="0"
                        value={product.orderQty}
                        onChange={(event) =>
                          updateOrderQuantity(product.id, event.target.value)
                        }
                        aria-label={`כמות להזמנה עבור ${product.name}`}
                      />
                    </td>
                    <td>{product.name}</td>
                    <td>{formatCurrency(product.price)}</td>
                    <td>{product.cartonQty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  )
}

export default App
