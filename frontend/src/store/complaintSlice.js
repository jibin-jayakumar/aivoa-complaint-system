import { createSlice } from '@reduxjs/toolkit'

const EMPTY_FORM = {
  complaint_source: '',
  customer_name: '',
  product_name: '',
  product_strength: '',
  batch_number: '',
  manufacturing_date: '',
  expiry_date: '',
  quantity_affected: '',
  complaint_type: '',
  complaint_date: '',
  complaint_description: '',
  initial_severity: '',
  priority: '',
}

const initialState = {
  form: { ...EMPTY_FORM },
}

const complaintSlice = createSlice({
  name: 'complaint',
  initialState,
  reducers: {
    setField: (state, action) => {
      const { field, value } = action.payload
      state.form[field] = value
    },
    setForm: (state, action) => {
      const incoming = action.payload || {}
      for (const key of Object.keys(EMPTY_FORM)) {
        if (incoming[key]) {
          state.form[key] = incoming[key]
        }
      }
    },
    replaceForm: (state, action) => {
      state.form = { ...EMPTY_FORM, ...(action.payload || {}) }
    },
    applyUpdates: (state, action) => {
      const updates = action.payload || {}
      for (const key of Object.keys(updates)) {
        if (key in EMPTY_FORM) {
          state.form[key] = updates[key]
        }
      }
    },
    resetForm: (state) => {
      state.form = { ...EMPTY_FORM }
    },
  },
})

export const { setField, setForm, replaceForm, applyUpdates, resetForm } = complaintSlice.actions
export const EMPTY_FORM_FIELDS = Object.keys(EMPTY_FORM)
export default complaintSlice.reducer