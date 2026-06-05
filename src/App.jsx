import { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import './App.css'

const STORAGE_KEY = 'hevron-supplier-orders-v2'
const SUPPLIERS_SHEET_NAME = 'ספקים'

const initialSuppliers = [
  {
    id: 'supplier-1',
    name: 'ספק לדוגמה',
    agentName: 'שם סוכן',
    phone: '0500000000',
    deliveryDay: 'ראשון',
    reminderTime: '09:00',
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
    agentName: '',
    phone: '',
    deliveryDay: 'שלישי',
    reminderTime: '11:30',
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

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

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

function calculateLineTotal(product) {
  return product.orderQty * product.cartonQty * product.price
}

function isHeaderRow(row, headers) {
  const firstCell = String(row[0] ?? '').trim()
  return headers.includes(firstCell)
}

function normalizePhone(phone) {
  const digits = String(phone ?? '').replace(/[^\d]/g, '')

  if (digits.startsWith('972')) {
    return digits
  }

  if (digits.startsWith('0')) {
    return `972${digits.slice(1)}`
  }

  return digits
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

function normalizeSupplierDetails(row, index) {
  return {
    id: createId(`supplier-${index}`),
    name: String(row[0] ?? '').trim(),
    agentName: String(row[1] ?? '').trim(),
    phone: String(row[2] ?? '').trim(),
    deliveryDay: String(row[3] ?? '').trim(),
    reminderTime: String(row[4] ?? '').trim(),
    products: [],
  }
}

function normalizeSavedSuppliers(suppliers) {
  return suppliers.map((supplier) => ({
    agentName: '',
    phone: '',
    deliveryDay: '',
    reminderTime: '',
    products: [],
    ...supplier,
    products: (supplier.products ?? []).map((product) => ({
      cartonQty: 0,
      price: 0,
      orderQty: 0,
      ...product,
    })),
  }))
}

function App() {
  const [suppliers, setSuppliers] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      return saved ? normalizeSavedSuppliers(JSON.parse(saved)) : initialSuppliers
    } catch {
      return initialSuppliers
    }
  })
  const [activeSupplierId, setActiveSupplierId] = useState(
    () => suppliers[0]?.id ?? '',
  )
  const [message, setMessage] = useState('')

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
      (total, product) => total + calculateLineTotal(product),
      0,
    )
  }, [activeSupplier])

  function updateActiveSupplier(updater) {
    setSuppliers((currentSuppliers) =>
      currentSuppliers.map((supplier) =>
        supplier.id === activeSupplierId ? updater(supplier) : supplier,
      ),
    )
  }

  function updateSupplierField(field, value) {
    updateActiveSupplier((supplier) => ({ ...supplier, [field]: value }))
  }

  function updateOrderQuantity(productId, value) {
    const orderQty = Math.max(0, parseNumber(value))

    updateActiveSupplier((supplier) => ({
      ...supplier,
      products: supplier.products.map((product) =>
        product.id === productId ? { ...product, orderQty } : product,
      ),
    }))
  }

  function moveProductToPosition(productId, nextPosition) {
    updateActiveSupplier((supplier) => {
      const currentIndex = supplier.products.findIndex(
        (product) => product.id === productId,
      )
      const nextIndex = Number(nextPosition) - 1

      if (
        currentIndex < 0 ||
        nextIndex < 0 ||
        nextIndex >= supplier.products.length ||
        currentIndex === nextIndex
      ) {
        return supplier
      }

      const products = [...supplier.products]
      const [product] = products.splice(currentIndex, 1)
      products.splice(nextIndex, 0, product)

      return { ...supplier, products }
    })
  }

  function resetQuantities() {
    updateActiveSupplier((supplier) => ({
      ...supplier,
      products: supplier.products.map((product) => ({ ...product, orderQty: 0 })),
    }))
  }

  function buildWhatsAppMessage(supplier) {
    const orderedProducts = supplier.products.filter((product) => product.orderQty > 0)

    if (orderedProducts.length === 0) {
      return ''
    }

    const agentName = supplier.agentName || supplier.name
    const rows = orderedProducts.map(
      (product) => `${product.orderQty} ${product.name}`,
    )

    return [
      `שלום ${agentName},`,
      'הזמנה לחברון שיווק סלטים בע״מ:',
      ...rows,
    ].join('\n')
  }

  function sendWhatsAppOrder() {
    if (!activeSupplier) {
      return
    }

    const text = buildWhatsAppMessage(activeSupplier)

    if (!text) {
      setMessage('אין מוצרים עם כמות להזמנה גדולה מ־0.')
      return
    }

    const phone = normalizePhone(activeSupplier.phone)
    const url = phone
      ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
      : `https://wa.me/?text=${encodeURIComponent(text)}`

    window.open(url, '_blank', 'noopener,noreferrer')
  }

  async function importExcel(event) {
    const file = event.target.files?.[0]
    event.target.value = ''

    if (!file) {
      return
    }

    const buffer = await file.arrayBuffer()
    const workbook = XLSX.read(buffer, { type: 'array' })
    const suppliersSheetName = workbook.SheetNames.find(
      (sheetName) => sheetName.trim() === SUPPLIERS_SHEET_NAME,
    )

    const supplierRows = suppliersSheetName
      ? XLSX.utils.sheet_to_json(workbook.Sheets[suppliersSheetName], {
          header: 1,
          defval: '',
        })
      : []

    const importedSuppliers = supplierRows
      .filter((row) => row.some((cell) => String(cell ?? '').trim()))
      .filter((row) => !isHeaderRow(row, ['שם הספק']))
      .map(normalizeSupplierDetails)
      .filter((supplier) => supplier.name)

    const supplierMap = new Map(
      importedSuppliers.map((supplier) => [supplier.name.trim(), supplier]),
    )

    workbook.SheetNames.filter((sheetName) => sheetName !== suppliersSheetName).forEach(
      (sheetName) => {
        const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
          header: 1,
          defval: '',
        })
        const products = rows
          .filter((row) => row.some((cell) => String(cell ?? '').trim()))
          .filter((row) => !isHeaderRow(row, ['שם מוצר', 'שם המוצר']))
          .map(normalizeProduct)
          .filter((product) => product.name)

        if (products.length === 0) {
          return
        }

        const existingSupplier = supplierMap.get(sheetName.trim())

        if (existingSupplier) {
          existingSupplier.products = products
          return
        }

        supplierMap.set(sheetName.trim(), {
          id: createId('supplier'),
          name: sheetName.trim(),
          agentName: '',
          phone: '',
          deliveryDay: '',
          reminderTime: '',
          products,
        })
      },
    )

    const nextSuppliers = Array.from(supplierMap.values()).filter(
      (supplier) => supplier.name && supplier.products.length > 0,
    )

    if (nextSuppliers.length === 0) {
      setMessage('לא נמצאו ספקים ומוצרים לייבוא בקובץ.')
      return
    }

    setSuppliers(nextSuppliers)
    setActiveSupplierId(nextSuppliers[0].id)
    setMessage(`יובאו ${nextSuppliers.length} ספקים מהאקסל.`)
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

      {message && <p className="status-message">{message}</p>}

      {activeSupplier && (
        <section className="supplier-panel">
          <div className="supplier-summary">
            <div>
              <span>ספק נבחר</span>
              <strong>{activeSupplier.name}</strong>
            </div>
            <div>
              <span>סוכן</span>
              <strong>{activeSupplier.agentName || 'לא הוגדר'}</strong>
            </div>
            <div>
              <span>סכום הזמנה</span>
              <strong>{formatCurrency(orderTotal)}</strong>
            </div>
          </div>

          <div className="supplier-details">
            <label>
              שם הספק
              <input
                type="text"
                value={activeSupplier.name}
                onChange={(event) => updateSupplierField('name', event.target.value)}
              />
            </label>
            <label>
              שם הסוכן
              <input
                type="text"
                value={activeSupplier.agentName}
                onChange={(event) => updateSupplierField('agentName', event.target.value)}
              />
            </label>
            <label>
              טלפון WhatsApp
              <input
                type="tel"
                value={activeSupplier.phone}
                onChange={(event) => updateSupplierField('phone', event.target.value)}
              />
            </label>
            <label>
              יום אספקה
              <input
                type="text"
                value={activeSupplier.deliveryDay}
                onChange={(event) => updateSupplierField('deliveryDay', event.target.value)}
              />
            </label>
            <label>
              שעה לתזכורת
              <input
                type="time"
                value={activeSupplier.reminderTime}
                onChange={(event) => updateSupplierField('reminderTime', event.target.value)}
              />
            </label>
          </div>

          <div className="actions-bar">
            <button type="button" onClick={resetQuantities}>
              איפוס כמויות
            </button>
            <button type="button" className="whatsapp-button" onClick={sendWhatsAppOrder}>
              שליחת הזמנה ל־WhatsApp
            </button>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>כמות להזמנה</th>
                  <th>שם מוצר</th>
                  <th className="desktop-column">מחיר ליחידה</th>
                  <th className="desktop-column">כמות בקרטון</th>
                  <th className="desktop-column">סה״כ שורה</th>
                  <th className="desktop-column">מיקום</th>
                </tr>
              </thead>
              <tbody>
                {activeSupplier.products.map((product, index) => (
                  <tr key={product.id}>
                    <td>
                      <input
                        type="number"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        min="0"
                        value={product.orderQty}
                        onChange={(event) =>
                          updateOrderQuantity(product.id, event.target.value)
                        }
                        aria-label={`כמות להזמנה עבור ${product.name}`}
                      />
                    </td>
                    <td>
                      <span>{product.name}</span>
                      <label className="mobile-position-control">
                        מיקום
                        <select
                          value={index + 1}
                          onChange={(event) =>
                            moveProductToPosition(product.id, event.target.value)
                          }
                          aria-label={`מיקום עבור ${product.name}`}
                        >
                          {activeSupplier.products.map((positionProduct, positionIndex) => (
                            <option key={positionProduct.id} value={positionIndex + 1}>
                              {positionIndex + 1}
                            </option>
                          ))}
                        </select>
                      </label>
                    </td>
                    <td className="desktop-column">{formatCurrency(product.price)}</td>
                    <td className="desktop-column">{product.cartonQty}</td>
                    <td className="desktop-column">{formatCurrency(calculateLineTotal(product))}</td>
                    <td className="desktop-column">
                      <select
                        value={index + 1}
                        onChange={(event) =>
                          moveProductToPosition(product.id, event.target.value)
                        }
                        aria-label={`מיקום עבור ${product.name}`}
                      >
                        {activeSupplier.products.map((positionProduct, positionIndex) => (
                          <option key={positionProduct.id} value={positionIndex + 1}>
                            {positionIndex + 1}
                          </option>
                        ))}
                      </select>
                    </td>
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
