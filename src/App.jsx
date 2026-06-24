import { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { isSupabaseConfigured, supabase } from './supabaseClient'
import './App.css'

const STORAGE_KEY = 'hevron-supplier-orders-v2'
const REMOTE_STATE_ID = 'supplier-orders'
const SUPPLIERS_SHEET_NAME = 'ספקים'
const emptyProductForm = {
  name: '',
  cartonQty: '',
  price: '',
}
const emptySupplierForm = {
  name: '',
  agentName: '',
  phone: '',
  deliveryDay: '',
  reminderTime: '',
}

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

function loadLocalSuppliers() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved ? normalizeSavedSuppliers(JSON.parse(saved)) : initialSuppliers
  } catch {
    return initialSuppliers
  }
}

function App() {
  const [suppliers, setSuppliers] = useState(loadLocalSuppliers)
  const [activeSupplierId, setActiveSupplierId] = useState(
    () => suppliers[0]?.id ?? '',
  )
  const [message, setMessage] = useState('')
  const [syncStatus, setSyncStatus] = useState(
    isSupabaseConfigured
      ? 'מתחבר ל-Supabase...'
      : 'שמירה מקומית בלבד - חסרים משתני Supabase.',
  )
  const [isRemoteLoaded, setIsRemoteLoaded] = useState(!isSupabaseConfigured)
  const [productForm, setProductForm] = useState(emptyProductForm)
  const [editingProductId, setEditingProductId] = useState('')
  const [isProductModalOpen, setIsProductModalOpen] = useState(false)
  const [supplierForm, setSupplierForm] = useState(emptySupplierForm)
  const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false)
  const [draggedProductId, setDraggedProductId] = useState('')

  useEffect(() => {
    let isMounted = true

    async function loadRemoteState() {
      if (!supabase) {
        return
      }

      const { data, error } = await supabase
        .from('app_state')
        .select('data')
        .eq('id', REMOTE_STATE_ID)
        .maybeSingle()

      if (!isMounted) {
        return
      }

      if (error) {
        setSyncStatus('שגיאה בטעינה מ-Supabase - עובדים כרגע עם שמירה מקומית.')
        setIsRemoteLoaded(true)
        return
      }

      const remoteSuppliers = data?.data?.suppliers

      if (Array.isArray(remoteSuppliers) && remoteSuppliers.length > 0) {
        const nextSuppliers = normalizeSavedSuppliers(remoteSuppliers)
        setSuppliers(nextSuppliers)
        setActiveSupplierId(nextSuppliers[0]?.id ?? '')
        setSyncStatus('נטען וסונכרן מ-Supabase.')
      } else {
        setSyncStatus('אין עדיין נתונים בענן - השינוי הבא יישמר ל-Supabase.')
      }

      setIsRemoteLoaded(true)
    }

    loadRemoteState()

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(suppliers))

    if (!supabase || !isRemoteLoaded) {
      return undefined
    }

    const timeoutId = window.setTimeout(async () => {
      const { error } = await supabase.from('app_state').upsert({
        id: REMOTE_STATE_ID,
        data: { suppliers },
        updated_at: new Date().toISOString(),
      })

      setSyncStatus(
        error
          ? 'שגיאה בשמירה ל-Supabase - השינויים נשמרו מקומית בלבד.'
          : 'נשמר וסונכרן ל-Supabase.',
      )
    }, 600)

    return () => window.clearTimeout(timeoutId)
  }, [isRemoteLoaded, suppliers])

  useEffect(() => {
    if (!suppliers.some((supplier) => supplier.id === activeSupplierId)) {
      setActiveSupplierId(suppliers[0]?.id ?? '')
    }
  }, [activeSupplierId, suppliers])

  const activeSupplier = useMemo(
    () => suppliers.find((supplier) => supplier.id === activeSupplierId),
    [activeSupplierId, suppliers],
  )

  const editingProduct = useMemo(() => {
    if (!activeSupplier || !editingProductId) {
      return null
    }

    return activeSupplier.products.find((product) => product.id === editingProductId) ?? null
  }, [activeSupplier, editingProductId])

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

  function selectZeroQuantity(event) {
    if (event.target.value === '0') {
      event.target.select()
    }
  }

  function moveProductBefore(targetProductId) {
    if (!draggedProductId || draggedProductId === targetProductId) {
      return
    }

    updateActiveSupplier((supplier) => {
      const draggedIndex = supplier.products.findIndex(
        (product) => product.id === draggedProductId,
      )
      const targetIndex = supplier.products.findIndex(
        (product) => product.id === targetProductId,
      )

      if (draggedIndex < 0 || targetIndex < 0 || draggedIndex === targetIndex) {
        return supplier
      }

      const products = [...supplier.products]
      const [draggedProduct] = products.splice(draggedIndex, 1)
      products.splice(targetIndex, 0, draggedProduct)

      return { ...supplier, products }
    })
  }

  function openAddSupplierModal() {
    setSupplierForm(emptySupplierForm)
    setIsSupplierModalOpen(true)
  }

  function closeSupplierModal() {
    setSupplierForm(emptySupplierForm)
    setIsSupplierModalOpen(false)
  }

  function addSupplier(event) {
    event.preventDefault()

    const name = supplierForm.name.trim()

    if (!name) {
      setMessage('יש להזין שם ספק.')
      return
    }

    const supplier = {
      id: createId('supplier'),
      name,
      agentName: supplierForm.agentName.trim(),
      phone: supplierForm.phone.trim(),
      deliveryDay: supplierForm.deliveryDay.trim(),
      reminderTime: supplierForm.reminderTime,
      products: [],
    }

    setSuppliers((currentSuppliers) => [...currentSuppliers, supplier])
    setActiveSupplierId(supplier.id)
    closeSupplierModal()
    setMessage('הספק נוסף. אפשר להוסיף לו מוצרים או לייבא אותם מאקסל.')
  }

  function deleteActiveSupplier() {
    if (!activeSupplier) {
      return
    }

    if (suppliers.length <= 1) {
      setMessage('לא ניתן למחוק את הספק האחרון.')
      return
    }

    if (!window.confirm(`למחוק את הספק ${activeSupplier.name}?`)) {
      return
    }

    const activeIndex = suppliers.findIndex((supplier) => supplier.id === activeSupplierId)
    const nextSuppliers = suppliers.filter((supplier) => supplier.id !== activeSupplierId)
    const nextActiveSupplier = nextSuppliers[Math.max(0, activeIndex - 1)] ?? nextSuppliers[0]

    setSuppliers(nextSuppliers)
    setActiveSupplierId(nextActiveSupplier?.id ?? '')
    setMessage('הספק נמחק.')
  }

  function openAddProductModal() {
    setEditingProductId('')
    setProductForm(emptyProductForm)
    setIsProductModalOpen(true)
  }

  function openEditProductModal(product) {
    setEditingProductId(product.id)
    setProductForm({
      name: product.name,
      cartonQty: String(product.cartonQty),
      price: String(product.price),
    })
    setIsProductModalOpen(true)
  }

  function closeProductModal() {
    setProductForm(emptyProductForm)
    setEditingProductId('')
    setIsProductModalOpen(false)
  }

  function saveProduct(event) {
    event.preventDefault()

    const name = productForm.name.trim()

    if (!name) {
      setMessage('יש להזין שם מוצר.')
      return
    }

    const productDetails = {
      name,
      cartonQty: Math.max(0, parseNumber(productForm.cartonQty)),
      price: Math.max(0, parseNumber(productForm.price)),
    }

    if (editingProductId) {
      updateActiveSupplier((supplier) => ({
        ...supplier,
        products: supplier.products.map((product) =>
          product.id === editingProductId ? { ...product, ...productDetails } : product,
        ),
      }))
      setMessage('המוצר עודכן.')
    } else {
      const product = {
        id: createId('product'),
        ...productDetails,
        orderQty: 0,
      }

      updateActiveSupplier((supplier) => ({
        ...supplier,
        products: [...supplier.products, product],
      }))
      setMessage('המוצר נוסף לספק הנוכחי.')
    }

    closeProductModal()
  }

  function deleteProduct(productId) {
    if (!activeSupplier) {
      return
    }

    const product = activeSupplier.products.find((item) => item.id === productId)

    if (!product) {
      return
    }

    if (!window.confirm(`למחוק את המוצר ${product.name}?`)) {
      return
    }

    updateActiveSupplier((supplier) => ({
      ...supplier,
      products: supplier.products.filter((item) => item.id !== productId),
    }))

    if (editingProductId === productId) {
      closeProductModal()
    }

    setMessage('המוצר נמחק.')
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

    const existingSuppliersByName = new Map(
      suppliers.map((supplier) => [supplier.name.trim(), supplier]),
    )
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
      .map((row, index) => {
        const supplier = normalizeSupplierDetails(row, index)
        const existingSupplier = existingSuppliersByName.get(supplier.name)

        return existingSupplier
          ? { ...existingSupplier, ...supplier, id: existingSupplier.id, products: [] }
          : supplier
      })
      .filter((supplier) => supplier.name)

    const supplierMap = new Map(
      importedSuppliers.map((supplier) => [supplier.name.trim(), supplier]),
    )

    workbook.SheetNames.filter((sheetName) => sheetName !== suppliersSheetName).forEach(
      (sheetName) => {
        const supplierName = sheetName.trim()
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

        const existingSupplier = supplierMap.get(supplierName)
        const savedSupplier = existingSuppliersByName.get(supplierName)

        if (existingSupplier) {
          existingSupplier.products = products
          return
        }

        supplierMap.set(supplierName, {
          id: savedSupplier?.id ?? createId('supplier'),
          name: supplierName,
          agentName: savedSupplier?.agentName ?? '',
          phone: savedSupplier?.phone ?? '',
          deliveryDay: savedSupplier?.deliveryDay ?? '',
          reminderTime: savedSupplier?.reminderTime ?? '',
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
    setMessage(`רשימת המוצרים הוחלפה לפי האקסל. יובאו ${nextSuppliers.length} ספקים.`)
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

      <div className="supplier-tools">
        <button type="button" onClick={openAddSupplierModal}>
          הוסף ספק
        </button>
        <button type="button" className="danger-button" onClick={deleteActiveSupplier}>
          מחק ספק
        </button>
      </div>

      {syncStatus && <p className="sync-message">{syncStatus}</p>}
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
            <button type="button" onClick={openAddProductModal}>
              הוסף מוצר
            </button>
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
                  <th className="desktop-column drag-column" aria-label="סידור מוצרים"></th>
                  <th>כמות להזמנה</th>
                  <th>שם מוצר</th>
                  <th className="desktop-column">מחיר ליחידה</th>
                  <th className="desktop-column">כמות בקרטון</th>
                  <th className="desktop-column">סה״כ שורה</th>
                  <th className="desktop-column">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {activeSupplier.products.map((product) => (
                  <tr
                    key={product.id}
                    className={draggedProductId === product.id ? 'dragging-row' : ''}
                    draggable
                    onDragStart={() => setDraggedProductId(product.id)}
                    onDragEnter={() => moveProductBefore(product.id)}
                    onDragOver={(event) => event.preventDefault()}
                    onDragEnd={() => setDraggedProductId('')}
                  >
                    <td className="desktop-column drag-column">
                      <span className="drag-handle" aria-label="גרירת מוצר" title="גרירת מוצר">
                        <span></span>
                        <span></span>
                        <span></span>
                        <span></span>
                        <span></span>
                        <span></span>
                        <span></span>
                        <span></span>
                        <span></span>
                      </span>
                    </td>
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
                        onFocus={selectZeroQuantity}
                        aria-label={`כמות להזמנה עבור ${product.name}`}
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="product-name-button"
                        onClick={() => openEditProductModal(product)}
                      >
                        {product.name}
                      </button>
                    </td>
                    <td className="desktop-column">{formatCurrency(product.price)}</td>
                    <td className="desktop-column">{product.cartonQty}</td>
                    <td className="desktop-column">{formatCurrency(calculateLineTotal(product))}</td>
                    <td className="desktop-column">
                      <div className="row-actions">
                        <button type="button" onClick={() => openEditProductModal(product)}>
                          ערוך
                        </button>
                        <button
                          type="button"
                          className="delete-product"
                          onClick={() => deleteProduct(product.id)}
                        >
                          מחק
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {isSupplierModalOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={closeSupplierModal}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-supplier-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <h2 id="add-supplier-title">הוספת ספק</h2>
              <button type="button" className="icon-button" onClick={closeSupplierModal}>
                סגור
              </button>
            </div>
            <form className="modal-form" onSubmit={addSupplier}>
              <label>
                שם ספק
                <input
                  type="text"
                  value={supplierForm.name}
                  onChange={(event) =>
                    setSupplierForm((current) => ({ ...current, name: event.target.value }))
                  }
                  autoFocus
                />
              </label>
              <label>
                שם סוכן
                <input
                  type="text"
                  value={supplierForm.agentName}
                  onChange={(event) =>
                    setSupplierForm((current) => ({ ...current, agentName: event.target.value }))
                  }
                />
              </label>
              <label>
                טלפון WhatsApp
                <input
                  type="tel"
                  value={supplierForm.phone}
                  onChange={(event) =>
                    setSupplierForm((current) => ({ ...current, phone: event.target.value }))
                  }
                />
              </label>
              <label>
                יום אספקה
                <input
                  type="text"
                  value={supplierForm.deliveryDay}
                  onChange={(event) =>
                    setSupplierForm((current) => ({ ...current, deliveryDay: event.target.value }))
                  }
                />
              </label>
              <label>
                שעה לתזכורת
                <input
                  type="time"
                  value={supplierForm.reminderTime}
                  onChange={(event) =>
                    setSupplierForm((current) => ({ ...current, reminderTime: event.target.value }))
                  }
                />
              </label>
              <div className="modal-actions">
                <button type="button" onClick={closeSupplierModal}>
                  ביטול
                </button>
                <button type="submit" className="whatsapp-button">
                  הוסף ספק
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {isProductModalOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={closeProductModal}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="product-modal-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <h2 id="product-modal-title">
                {editingProductId ? 'עריכת מוצר' : 'הוספת מוצר'}
              </h2>
              <button type="button" className="icon-button" onClick={closeProductModal}>
                סגור
              </button>
            </div>
            <form className="modal-form" onSubmit={saveProduct}>
              <label>
                שם מוצר
                <input
                  type="text"
                  value={productForm.name}
                  onChange={(event) =>
                    setProductForm((current) => ({ ...current, name: event.target.value }))
                  }
                  placeholder="שם מוצר"
                  autoFocus
                />
              </label>
              <label>
                כמות בקרטון
                <input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  value={productForm.cartonQty}
                  onChange={(event) =>
                    setProductForm((current) => ({ ...current, cartonQty: event.target.value }))
                  }
                />
              </label>
              <label>
                מחיר ליחידה
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={productForm.price}
                  onChange={(event) =>
                    setProductForm((current) => ({ ...current, price: event.target.value }))
                  }
                />
              </label>
              <div className="modal-actions split-actions">
                <div>
                  {editingProduct && (
                    <button
                      type="button"
                      className="danger-button"
                      onClick={() => deleteProduct(editingProduct.id)}
                    >
                      מחק מוצר
                    </button>
                  )}
                </div>
                <div className="primary-actions">
                  <button type="button" onClick={closeProductModal}>
                    ביטול
                  </button>
                  <button type="submit" className="whatsapp-button">
                    {editingProductId ? 'שמור מוצר' : 'הוסף מוצר'}
                  </button>
                </div>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  )
}

export default App
