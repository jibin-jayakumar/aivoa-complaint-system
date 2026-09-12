import { useState, useRef, useEffect } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import axios from 'axios'
import './App.css'
import {
  setField,
  setForm,
  replaceForm,
  applyUpdates,
  resetForm,
} from './store/complaintSlice'

const API_URL = 'http://127.0.0.1:8000/complaints/analyze'
const UPLOAD_URL = 'http://127.0.0.1:8000/complaints/upload'
const SAVE_URL = 'http://127.0.0.1:8000/complaints'
const UPDATE_URL = 'http://127.0.0.1:8000/complaints/update-field'

function App() {
  const dispatch = useDispatch()
  const form = useSelector((state) => state.complaint.form)

  const [messages, setMessages] = useState([
    {
      role: 'ai',
      text: 'Upload a complaint document or paste text above. I will automatically extract the details and populate the form for you. Once the form is filled, you can ask me to change specific fields.',
    },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [progress, setProgress] = useState(0)
  const [showList, setShowList] = useState(false)
  const [complaints, setComplaints] = useState([])
  const [loadingList, setLoadingList] = useState(false)
  const messagesEndRef = useRef(null)
  const fileInputRef = useRef(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function handleFormChange(field, value) {
    dispatch(setField({ field, value }))
  }

  function fillFormFromData(data) {
    dispatch(setForm(data))
  }

  function handleReset() {
    dispatch(resetForm())
    setMessages([
      { role: 'ai', text: 'Form reset. Describe a complaint to begin.' },
    ])
    setProgress(0)
  }

  async function handleSend() {
    const text = input.trim()
    if (!text || loading) return

    setMessages((prev) => [...prev, { role: 'user', text }])
    setInput('')
    setLoading(true)
    setProgress(10)

    const timer = setInterval(() => {
      setProgress((p) => (p < 90 ? p + 10 : p))
    }, 300)

    try {
      const response = await axios.post(API_URL, { text })
      fillFormFromData(response.data)

      setMessages((prev) => [
        ...prev,
        { role: 'ai', text: 'Extraction complete. The form has been populated on the left.' },
      ])
      setProgress(100)
      setTimeout(() => setProgress(0), 1200)
    } catch (err) {
      const detail = err.response?.data?.detail || err.message || 'unknown error'
      setMessages((prev) => [
        ...prev,
        { role: 'ai', text: 'Something went wrong: ' + detail },
      ])
      setProgress(0)
    } finally {
      clearInterval(timer)
      setLoading(false)
    }
  }

  async function handleFileUpload(file) {
    if (!file) return

    setMessages((prev) => [...prev, { role: 'user', text: `📎 Uploaded: ${file.name}` }])
    setLoading(true)
    setProgress(15)

    const timer = setInterval(() => {
      setProgress((p) => (p < 90 ? p + 10 : p))
    }, 300)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await axios.post(UPLOAD_URL, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })

      fillFormFromData(response.data)

      setMessages((prev) => [
        ...prev,
        { role: 'ai', text: `Extracted details from ${file.name} and filled the form.` },
      ])
      setProgress(100)
      setTimeout(() => setProgress(0), 1200)
    } catch (err) {
      const detail = err.response?.data?.detail || err.message || 'unknown error'
      setMessages((prev) => [
        ...prev,
        { role: 'ai', text: 'Upload failed: ' + detail },
      ])
      setProgress(0)
    } finally {
      clearInterval(timer)
      setLoading(false)
    }
  }

  async function handleSave() {
    setSaving(true)
    try {
      const response = await axios.post(SAVE_URL, form)
      const saved = response.data
      setMessages((prev) => [
        ...prev,
        { role: 'ai', text: `✓ Complaint #${saved.id} saved to database.` },
      ])
    } catch (err) {
      const detail = err.response?.data?.detail || err.message || 'unknown error'
      setMessages((prev) => [
        ...prev,
        { role: 'ai', text: 'Save failed: ' + detail },
      ])
    } finally {
      setSaving(false)
    }
  }

  async function handleViewComplaints() {
    setShowList(true)
    setLoadingList(true)
    try {
      const response = await axios.get(SAVE_URL)
      setComplaints(response.data)
    } catch (err) {
      setComplaints([])
    } finally {
      setLoadingList(false)
    }
  }

  function loadComplaint(c) {
    const { id, created_at, ...rest } = c
    dispatch(replaceForm(rest))
    setShowList(false)
    setMessages((prev) => [
      ...prev,
      { role: 'ai', text: `Loaded complaint #${c.id} into the form.` },
    ])
  }

  function handleBrowseClick() {
    fileInputRef.current?.click()
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (file) handleFileUpload(file)
    e.target.value = ''
  }

  function handleDrop(e) {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (file) handleFileUpload(file)
  }

  function handleDragOver(e) {
    e.preventDefault()
  }

  async function handleUpdate() {
    const text = input.trim()
    if (!text || loading) return

    const hasFormData = Object.values(form).some((v) => v && v.trim() !== '')
    if (!hasFormData) {
      return handleSend()
    }

    setMessages((prev) => [...prev, { role: 'user', text }])
    setInput('')
    setLoading(true)

    try {
      const response = await axios.post(UPDATE_URL, {
        current_form: form,
        instruction: text,
      })

      const { updates, message } = response.data

      if (updates && Object.keys(updates).length > 0) {
        dispatch(applyUpdates(updates))
        setMessages((prev) => [...prev, { role: 'ai', text: message }])
      } else {
        setMessages((prev) => [
          ...prev,
          { role: 'ai', text: message || "I couldn't determine what to change." },
        ])
      }
    } catch (err) {
      const detail = err.response?.data?.detail || err.message || 'unknown error'
      setMessages((prev) => [...prev, { role: 'ai', text: 'Update failed: ' + detail }])
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleUpdate()
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>AIVOA</h1>
        <button className="header-btn" onClick={handleViewComplaints}>
          View Complaints
        </button>
      </header>

      <div className="layout">
        <section className="form-panel">
          <div className="panel-header">
            <div>
              <h2>Log Customer Complaint</h2>
              <p className="panel-subtitle">API &amp; FDF Quality Assurance Module</p>
            </div>
          </div>

          <div className="form-section">
            <h3>1. Origin &amp; Customer Details</h3>
            <div className="form-grid">
              <label>
                Complaint Source
                <input
                  type="text"
                  value={form.complaint_source}
                  onChange={(e) => handleFormChange('complaint_source', e.target.value)}
                  placeholder="Awaiting AI extraction..."
                />
              </label>
              <label>
                Customer Name
                <input
                  type="text"
                  value={form.customer_name}
                  onChange={(e) => handleFormChange('customer_name', e.target.value)}
                  placeholder="Awaiting AI extraction..."
                />
              </label>
            </div>
          </div>

          <div className="form-section">
            <h3>2. Product &amp; Batch Identification</h3>
            <div className="form-grid">
              <label>
                Product Name
                <input
                  type="text"
                  value={form.product_name}
                  onChange={(e) => handleFormChange('product_name', e.target.value)}
                  placeholder="Awaiting AI extraction..."
                />
              </label>
              <label>
                Product Strength / Grade
                <input
                  type="text"
                  value={form.product_strength}
                  onChange={(e) => handleFormChange('product_strength', e.target.value)}
                  placeholder="Awaiting AI extraction..."
                />
              </label>
              <label>
                Batch / Lot Number
                <input
                  type="text"
                  value={form.batch_number}
                  onChange={(e) => handleFormChange('batch_number', e.target.value)}
                  placeholder="Awaiting AI extraction..."
                />
              </label>
              <label>
                Manufacturing Date
                <input
                  type="text"
                  value={form.manufacturing_date}
                  onChange={(e) => handleFormChange('manufacturing_date', e.target.value)}
                  placeholder="Awaiting AI extraction..."
                />
              </label>
              <label>
                Expiry Date
                <input
                  type="text"
                  value={form.expiry_date}
                  onChange={(e) => handleFormChange('expiry_date', e.target.value)}
                  placeholder="Awaiting AI extraction..."
                />
              </label>
              <label>
                Quantity Affected
                <input
                  type="text"
                  value={form.quantity_affected}
                  onChange={(e) => handleFormChange('quantity_affected', e.target.value)}
                  placeholder="Awaiting AI extraction..."
                />
              </label>
            </div>
          </div>

          <div className="form-section">
            <h3>3. Complaint Details</h3>
            <div className="form-grid">
              <label>
                Complaint Type
                <input
                  type="text"
                  value={form.complaint_type}
                  onChange={(e) => handleFormChange('complaint_type', e.target.value)}
                  placeholder="Awaiting AI extraction..."
                />
              </label>
              <label>
                Complaint Date
                <input
                  type="text"
                  value={form.complaint_date}
                  onChange={(e) => handleFormChange('complaint_date', e.target.value)}
                  placeholder="Awaiting AI extraction..."
                />
              </label>
              <label className="full-width">
                Detailed Complaint Description
                <textarea
                  value={form.complaint_description}
                  onChange={(e) => handleFormChange('complaint_description', e.target.value)}
                  placeholder="Awaiting AI extraction..."
                  rows={4}
                />
              </label>
            </div>
          </div>

          <div className="form-section">
            <h3>4. Initial Assessment &amp; Priority</h3>
            <div className="form-grid">
              <label>
                Initial Severity
                <input
                  type="text"
                  value={form.initial_severity}
                  onChange={(e) => handleFormChange('initial_severity', e.target.value)}
                  placeholder="Awaiting AI extraction..."
                />
              </label>
              <label>
                Priority
                <input
                  type="text"
                  value={form.priority}
                  onChange={(e) => handleFormChange('priority', e.target.value)}
                  placeholder="Awaiting AI extraction..."
                />
              </label>
            </div>
          </div>

          <div className="form-footer">
            <button className="btn-secondary" onClick={handleReset}>↻ Reset Form</button>
            <button className="btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save Complaint'}
            </button>
          </div>
        </section>

        <section className="chat-panel">
          <div className="panel-header">
            <div className="assistant-title">
              <h2>AI Complaint Intake Assistant</h2>
            </div>
            <span className="beta-badge">BETA</span>
          </div>

          <div
            className="drop-zone"
            onClick={handleBrowseClick}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
          >
            <div className="upload-icon">☁</div>
            <p><strong>Drag &amp; drop complaint document here</strong></p>
            <p className="drop-sub">or click to browse</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.txt"
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
          </div>

          <div className="or-divider"><span>OR</span></div>

          <button className="paste-btn">📋 Paste Complaint Text / Email</button>

          <div className="supported-formats">
            <span className="check">✅</span>
            <div>
              <strong>Supported formats: PDF, DOCX, TXT, EML</strong>
              <p>Max file size 10MB</p>
            </div>
          </div>

          {progress > 0 && (
            <div className="progress-block">
              <div className="progress-label">
                <span>EXTRACTION PROGRESS</span>
                <span>{progress}%</span>
              </div>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${progress}%` }} />
              </div>
              <p className="progress-note">
                Analyzing document content and extracting key details... Please wait.
              </p>
            </div>
          )}

          <div className="chat-messages">
            <div className="chat-messages-label">AI ASSISTANT</div>
            {messages.map((msg, i) => (
              <div key={i} className={`message ${msg.role}`}>{msg.text}</div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          <div className="chat-input-row">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask me anything about this complaint..."
            />
            <button onClick={handleUpdate} disabled={loading || !input.trim()}>
              {loading ? '…' : '→'}
            </button>
          </div>
          <p className="disclaimer">AI responses may contain errors. Please verify information.</p>
        </section>
      </div>

      {showList && (
        <div className="modal-overlay" onClick={() => setShowList(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Saved Complaints</h2>
              <button className="modal-close" onClick={() => setShowList(false)}>×</button>
            </div>
            <div className="modal-body">
              {loadingList ? (
                <p>Loading…</p>
              ) : complaints.length === 0 ? (
                <p>No complaints saved yet.</p>
              ) : (
                <table className="complaints-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Customer</th>
                      <th>Product</th>
                      <th>Batch</th>
                      <th>Severity</th>
                      <th>Priority</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {complaints.map((c) => (
                      <tr key={c.id}>
                        <td>#{c.id}</td>
                        <td>{c.customer_name}</td>
                        <td>{c.product_name}</td>
                        <td>{c.batch_number}</td>
                        <td>{c.initial_severity}</td>
                        <td>{c.priority}</td>
                        <td>
                          <button className="btn-load" onClick={() => loadComplaint(c)}>
                            Load
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App