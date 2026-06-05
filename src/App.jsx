import { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import './App.css'

const STORAGE_KEY = 'hevron-salad-supplier-orders-v1'

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
]

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function parseNumber(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0
  }

  if (typeof value !== 'string') {
    return 0
  }

  const normalized = value.replace(',', '.').trim()
  const number = Number(normalized)
  return Number.isFinite(number) ? number : 0
}

function formatCurrency(value) {
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
    maximumFractionDigits: 2,
  }).format(value)
}

function normalizeProduct(row, index) {
  return {
    id: createId(`product-${index}`),
    name: String(row[0] ?? '').trim(),
    cartonQty: parseNumber(row[1]),
    price: parseNumber(row[2]),
    orderQty: 0,
  }
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
  const [newSupplierName, setNewSupplierName] = useState('')
  const [importMessage, setImportMessage] = useState('')

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(suppliers))
  }, [suppliers])

  useEffect(() => {
    if (!suppliers.some((supplier) => supplier.id === activeSupplierId)) {
      setActiveSupplierId(suppliers[0]?.id ?? '')
    }
  }, [activeSupplierId, suppliers])

  const activeSupplier = useMemo(
    () => suppliers.find((supplier) => supplier.id === activeSupplierId),
    [activeSupplierId, suppliers],
  )

  const orderTotal = useMemo(() => {
    if (!activeSupplier) {
      return 0
    }

    return activeSupplier.products.reduce(
      (total, product) => total + product.orderQty * product.price,
      0,
    )
  }, [activeSupplier])

  function updateSupplier(supplierId, updater) {
    setSuppliers((currentSuppliers) =>
      currentSuppliers.map((supplier) =>
        supplier.id === supplierId ? updater(supplier) : supplier,
      ),
    )
  }

  function updateProduct(supplierId, productId, field, value) {
    updateSupplier(supplierId, (supplier) => ({
      ...supplier,
      products: supplier.products.map((product) => {
        if (product.id !== productId) {
          return product
        }

        const numericFields = ['cartonQty', 'price', 'orderQty']
        return {
          ...product,
          [field]: numericFields.includes(field) ? parseNumber(value) : value,
        }
      }),
    }))
  }

  function addSupplier() {
    const name = newSupplierName.trim()

    if (!name) {
      return
    }

    const supplier = {
      id: createId('supplier'),
      name,
      products: [],
    }

    setSuppliers((currentSuppliers) => [...currentSuppliers, supplier])
    setActiveSupplierId(supplier.id)
    setNewSupplierName('')
  }

  function addProduct(supplierId) {
    const product = {
      id: createId('product'),
      name: 'מוצר חדש',
      cartonQty: 1,
      price: 0,
      orderQty: 0,
    }

    updateSupplier(supplierId, (supplier) => ({
      ...supplier,
      products: [...supplier.products, product],
    }))
  }

  function deleteProduct(supplierId, productId) {
    updateSupplier(supplierId, (supplier) => ({
      ...supplier,
      products: supplier.products.filter((product) => product.id !== productId),
    }))
  }

  function moveProduct(supplierId, productId, direction) {
    updateSupplier(supplierId, (supplier) => {
      const productIndex = supplier.products.findIndex(
        (product) => product.id === productId,
      )
      const nextIndex = productIndex + direction

      if (productIndex < 0 || nextIndex < 0 || nextIndex >= supplier.products.length) {
        return supplier
      }

      const products = [...supplier.products]
      const [product] = products.splice(productIndex, 1)
      products.splice(nextIndex, 0, product)

      return { ...supplier, products }
    })
  }

  function resetQuantities(supplierId) {
    updateSupplier(supplierId, (supplier) => ({
      ...supplier,
      products: supplier.products.map((product) => ({ ...product, orderQty: 0 })),
    }))
  }

  function buildWhatsAppMessage(supplier) {
    const orderedProducts = supplier.products.filter((product) => product.orderQty > 0)

    if (orderedProducts.length === 0) {
      return ''
    }

    const rows = orderedProducts.map(
      (product) =>
        `• ${product.name} - כמות: ${product.orderQty}, מחיר: ${formatCurrency(
          product.price,
        )}, כמות בקרטון: ${product.cartonQty}`,
    )

    return [
      'הזמנה חדשה - חברון שיווק סלטים בע״מ',
      `ספק: ${supplier.name}`,
      '',
      ...rows,
      '',
      `סה״כ הזמנה: ${formatCurrency(
        orderedProducts.reduce(
          (total, product) => total + product.orderQty * product.price,
          0,
        ),
      )}`,
    ].join('\n')
  }

  function sendToWhatsApp() {
    if (!activeSupplier) {
      return
    }

    const message = buildWhatsAppMessage(activeSupplier)

    if (!message) {
      setImportMessage('אין מוצרים עם כמות להזמנה גדולה מ־0.')
      return
    }

    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank')
  }

  async function importExcel(event) {
    const file = event.target.files?.[0]
    event.target.value = ''

    if (!file) {
      return
    }

    const buffer = await file.arrayBuffer()
    const workbook = XLSX.read(buffer, { type: 'array' })
    const importedSuppliers = workbook.SheetNames.map((sheetName) => {
      const worksheet = workbook.Sheets[sheetName]
      const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' })
      const products = rows
        .map(normalizeProduct)
        .filter((product) => product.name.length > 0)

      return {
        id: createId('supplier'),
        name: sheetName,
        products,
      }
    }).filter((supplier) => supplier.products.length > 0)

    if (importedSuppliers.length === 0) {
      setImportMessage('לא נמצאו מוצרים לייבוא בקובץ.')
      return
    }

    setSuppliers(importedSuppliers)
    setActiveSupplierId(importedSuppliers[0].id)
    setImportMessage(`יובאו ${importedSuppliers.length} ספקים מהקובץ.`)
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">חברון שיווק סלטים בע״מ</p>
          <h1>הזמנות ספקים</h1>
        </div>
        <label className="import-button">
          ייבוא מאקסל
          <input type="file" accept=".xlsx,.xls" onChange={importExcel} />
        </label>
      </header>

      <section className="supplier-manager" aria-label="ניהול ספקים">
        <div className="supplier-tabs" role="tablist" aria-label="ספקים">
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
        </div>

        <div className="add-supplier">
          <input
            type="text"
            value={newSupplierName}
            onChange={(event) => setNewSupplierName(event.target.value)}
            placeholder="שם ספק חדש"
          />
          <button type="button" onClick={addSupplier}>
            הוסף ספק
          </button>
        </div>
      </section>

      {importMessage && <p className="status-message">{importMessage}</p>}

      {activeSupplier ? (
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
            <div className="summary-actions">
              <button type="button" onClick={() => addProduct(activeSupplier.id)}>
                הוסף מוצר
              </button>
              <button type="button" onClick={() => resetQuantities(activeSupplier.id)}>
                איפוס כמויות
              </button>
              <button type="button" className="whatsapp" onClick={sendToWhatsApp}>
                שידור ל־WhatsApp
              </button>
            </div>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>כמות להזמנה</th>
                  <th>שם מוצר</th>
                  <th>מחיר קניה</th>
                  <th>כמות בקרטון</th>
                  <th>סדר</th>
                  <th>פעולות</th>
                </tr>
              </thead>
              <tbody>
                {activeSupplier.products.map((product, index) => (
                  <tr key={product.id}>
                    <td>
                      <input
                        type="number"
                        min="0"
                        value={product.orderQty}
                        onChange={(event) =>
                          updateProduct(
                            activeSupplier.id,
                            product.id,
                            'orderQty',
                            event.target.value,
                          )
                        }
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        value={product.name}
                        onChange={(event) =>
                          updateProduct(
                            activeSupplier.id,
                            product.id,
                            'name',
                            event.target.value,
                          )
                        }
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={product.price}
                        onChange={(event) =>
                          updateProduct(
                            activeSupplier.id,
                            product.id,
                            'price',
                            event.target.value,
                          )
                        }
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        value={product.cartonQty}
                        onChange={(event) =>
                          updateProduct(
                            activeSupplier.id,
                            product.id,
                            'cartonQty',
                            event.target.value,
                          )
                        }
                      />
                    </td>
                    <td className="order-buttons">
                      <button
                        type="button"
                        onClick={() => moveProduct(activeSupplier.id, product.id, -1)}
                        disabled={index === 0}
                      >
                        למעלה
                      </button>
                      <button
                        type="button"
                        onClick={() => moveProduct(activeSupplier.id, product.id, 1)}
                        disabled={index === activeSupplier.products.length - 1}
                      >
                        למטה
                      </button>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="danger"
                        onClick={() => deleteProduct(activeSupplier.id, product.id)}
                      >
                        מחק
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {activeSupplier.products.length === 0 && (
              <p className="empty-state">אין מוצרים לספק הזה עדיין.</p>
            )}
          </div>
        </section>
      ) : (
        <section className="empty-state">יש להוסיף ספק כדי להתחיל הזמנה.</section>
      )}
    </main>
  )
}

export default App
