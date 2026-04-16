import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createReadStream,
  existsSync,
  readFileSync,
  statSync,
} from 'node:fs'
import { readFile } from 'node:fs/promises'
import crypto from 'node:crypto'
import mysql from 'mysql2/promise'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = __dirname
const distDir = path.join(rootDir, 'dist')
const isProd = process.argv.includes('--prod') || process.env.NODE_ENV === 'production'
const port = Number(process.env.PORT || 3000)
const dbHost = process.env.DB_HOST || '127.0.0.1'
const dbPort = Number(process.env.DB_PORT || 3306)
const dbUser = process.env.DB_USER || 'root'
const dbPassword = process.env.DB_PASSWORD || 'server1'
const dbName = process.env.DB_NAME || 'z_track'
const tokenTtlDays = 7
const requiredProductionEnvVars = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME']

let pool = null
let server = null
let shuttingDown = false

function isoNow() {
  return new Date().toISOString()
}

function isoInDays(days) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date.toISOString()
}

function json(res, statusCode, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  })
  res.end(body)
}

function text(res, statusCode, body, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(statusCode, {
    'Content-Type': contentType,
    'Cache-Control': 'no-store',
  })
  res.end(body)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', chunk => chunks.push(chunk))
    req.on('end', () => {
      if (!chunks.length) {
        resolve({})
        return
      }

      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch (error) {
        reject(error)
      }
    })
    req.on('error', reject)
  })
}

function getBearerToken(req) {
  const header = req.headers.authorization || ''
  const match = header.match(/^Bearer\s+(.+)$/i)
  return match ? match[1] : ''
}

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  return {
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.json': 'application/json; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
  }[ext] || 'application/octet-stream'
}

function assertProductionConfig() {
  if (!isProd) return

  const missing = requiredProductionEnvVars.filter(name => !String(process.env[name] || '').trim())
  if (missing.length > 0) {
    throw new Error(`Missing required production environment variables: ${missing.join(', ')}`)
  }
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('base64url')) {
  const derived = crypto.scryptSync(String(password), salt, 64)
  return {
    salt,
    hash: derived.toString('base64url'),
    scheme: 'scrypt',
  }
}

function verifyPassword(password, row) {
  if (!row) return false
  const derived = crypto.scryptSync(String(password), row.password_salt, 64)
  const expected = Buffer.from(row.password_hash, 'base64url')
  if (derived.length !== expected.length) return false
  return crypto.timingSafeEqual(derived, expected)
}

function publicUser(row) {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    department: row.department,
  }
}

function privateUser(row) {
  return {
    ...publicUser(row),
    passwordStatus: 'Stored securely',
  }
}

function requestFromRow(row) {
  return {
    id: row.id,
    date: row.date,
    employeeName: row.employee_name,
    employeeId: row.employee_id,
    department: row.department,
    requestType: row.request_type,
    priority: row.priority,
    pickupAddress: row.pickup_address,
    dropAddress: row.drop_address,
    contactPerson: row.contact_person,
    mobileNumber: row.mobile_number,
    meetingTiming: row.meeting_timing,
    description: row.description,
    assignedPerson: row.assigned_person,
    lineupTiming: row.lineup_timing,
    status: row.status,
    adminComments: row.admin_comments,
    completionDate: row.completion_date,
  }
}

async function queryAll(sql, params = []) {
  const [rows] = await pool.query(sql, params)
  return rows
}

async function queryOne(sql, params = []) {
  const rows = await queryAll(sql, params)
  return rows[0] || null
}

async function execute(sql, params = []) {
  const [result] = await pool.execute(sql, params)
  return result
}

async function withTransaction(fn) {
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const result = await fn(conn)
    await conn.commit()
    return result
  } catch (error) {
    try {
      await conn.rollback()
    } catch (rollbackError) {
      void rollbackError
    }
    throw error
  } finally {
    conn.release()
  }
}

async function initSchema() {
  await execute(`
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(80) PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      role VARCHAR(40) NOT NULL,
      department VARCHAR(120) NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      password_salt VARCHAR(80) NOT NULL,
      password_scheme VARCHAR(40) NOT NULL DEFAULT 'scrypt',
      created_at VARCHAR(40) NOT NULL,
      updated_at VARCHAR(40) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)

  await execute(`
    CREATE TABLE IF NOT EXISTS runners (
      name VARCHAR(120) PRIMARY KEY,
      sort_order INT NOT NULL DEFAULT 0,
      created_at VARCHAR(40) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)

  await execute(`
    CREATE TABLE IF NOT EXISTS requests (
      id VARCHAR(40) PRIMARY KEY,
      date VARCHAR(40) NOT NULL,
      employee_name VARCHAR(120) NOT NULL,
      employee_id VARCHAR(80) NOT NULL,
      department VARCHAR(120) NOT NULL,
      request_type VARCHAR(40) NOT NULL,
      priority VARCHAR(20) NOT NULL,
      pickup_address TEXT NOT NULL,
      drop_address TEXT NOT NULL,
      contact_person VARCHAR(120) NOT NULL,
      mobile_number VARCHAR(20) NOT NULL,
      meeting_timing VARCHAR(40) NOT NULL,
      description TEXT NOT NULL,
      assigned_person VARCHAR(120) NOT NULL DEFAULT '',
      lineup_timing VARCHAR(40) NOT NULL DEFAULT '',
      status VARCHAR(40) NOT NULL,
      admin_comments TEXT NOT NULL,
      completion_date VARCHAR(40) DEFAULT NULL,
      created_at VARCHAR(40) NOT NULL,
      updated_at VARCHAR(40) NOT NULL,
      INDEX idx_requests_employee (employee_id),
      INDEX idx_requests_date (date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)

  await execute(`
    CREATE TABLE IF NOT EXISTS sessions (
      token VARCHAR(80) PRIMARY KEY,
      user_id VARCHAR(80) NOT NULL,
      created_at VARCHAR(40) NOT NULL,
      expires_at VARCHAR(40) NOT NULL,
      INDEX idx_sessions_expires (expires_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
}

const seedUsers = [
  { id: 'admin', name: 'Super Admin', role: 'Super Admin', department: 'Operations', password: 'Zuari@54321' },
  { id: 'subadmin', name: 'Admin User', role: 'Admin', department: 'Admin', password: 'ADMIN@12345' },
  { id: 'hr', name: 'HR User', role: 'Employee', department: 'HR', password: 'HR@12345' },
  { id: 'finance', name: 'Finance User', role: 'Employee', department: 'Finance', password: 'FINANCE@12345' },
  { id: 'it', name: 'IT User', role: 'Employee', department: 'IT', password: 'IT@12345' },
  { id: 'backoffice', name: 'Back Office User', role: 'Employee', department: 'Back Office', password: 'BACKOFFICE@12345' },
  { id: 'rms', name: 'RMS User', role: 'Employee', department: 'RMS', password: 'RMS@12345' },
  { id: 'mfo', name: 'MFO User', role: 'Employee', department: 'MFO', password: 'MFO@12345' },
  { id: 'rta', name: 'RTA User', role: 'Employee', department: 'RTA', password: 'RTA@12345' },
  { id: 'cs', name: 'CS User', role: 'Employee', department: 'CS', password: 'CS@12345' },
  { id: 'compliance', name: 'Compliance User', role: 'Employee', department: 'Compliance', password: 'COMPLIANCE@12345' },
  { id: 'delhi1', name: 'Delhi 1 User', role: 'Employee', department: 'Delhi 1', password: 'DELHI1@12345' },
  { id: 'delhi2', name: 'Delhi 2 User', role: 'Employee', department: 'Delhi 2', password: 'DELHI2@12345' },
  { id: 'dp', name: 'Dp User', role: 'Employee', department: 'Dp', password: 'DP@12345' },
  { id: 'kyc', name: 'Kyc User', role: 'Employee', department: 'Kyc', password: 'KYC@12345' },
  { id: 'customerservice', name: 'Customer Service User', role: 'Employee', department: 'Customer Service', password: 'CUSTOMER@12345' },
  { id: 'insurance', name: 'Insurance User', role: 'Employee', department: 'Insurance', password: 'INSURANCE@12345' },
]

const seedRunners = ['Babulal', 'Atul', 'Narendra']

const seedRequests = [
  {
    id: 'TKT-8492',
    date: '2026-03-30T09:15:00.000Z',
    employeeName: 'Finance User',
    employeeId: 'finance',
    department: 'Finance',
    requestType: 'Pick-up',
    priority: 'High',
    pickupAddress: 'Tower A, 4th Floor, Finance Dept',
    dropAddress: 'Vendor Office, Sector 44',
    contactPerson: 'Mr. Sharma',
    mobileNumber: '9876543210',
    meetingTiming: '2026-03-31T14:00',
    description: 'Urgent tax documents for signature.',
    assignedPerson: 'Atul',
    lineupTiming: '2026-03-31T13:30',
    status: 'In Progress',
    adminComments: 'Runner dispatched.',
    completionDate: null,
  },
  {
    id: 'TKT-1023',
    date: '2026-03-29T11:00:00.000Z',
    employeeName: 'HR User',
    employeeId: 'hr',
    department: 'HR',
    requestType: 'Both',
    priority: 'Medium',
    pickupAddress: 'Candidate Home, DLF Phase 3',
    dropAddress: 'Tower B, Ground Floor HR',
    contactPerson: 'New Hire (Amit)',
    mobileNumber: '9988776655',
    meetingTiming: '2026-03-30T10:00',
    description: 'Onboarding laptop delivery and signed offer letter pickup.',
    assignedPerson: 'Babulal',
    lineupTiming: '2026-03-30T09:00',
    status: 'Completed',
    adminComments: 'Task finished successfully.',
    completionDate: '2026-03-30T11:30:00.000Z',
  },
]

async function seedDatabase() {
  const userCount = await queryOne('SELECT COUNT(*) AS count FROM users')
  if (!userCount || Number(userCount.count) === 0) {
    await withTransaction(async conn => {
      const timestamp = isoNow()
      for (const user of seedUsers) {
        const hashed = hashPassword(user.password)
        await conn.execute(
          `INSERT INTO users
            (id, name, role, department, password_hash, password_salt, password_scheme, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            user.id,
            user.name,
            user.role,
            user.department,
            hashed.hash,
            hashed.salt,
            hashed.scheme,
            timestamp,
            timestamp,
          ],
        )
      }
    })
  } else {
    // Migration: Update admin to Super Admin if needed
    await execute(`UPDATE users SET role = 'Super Admin' WHERE id = 'admin' AND role = 'Admin'`)
    
    // Migration: Insert the subadmin if it doesn't already exist
    const subadminCount = await queryOne('SELECT COUNT(*) AS count FROM users WHERE id = ?', ['subadmin'])
    if (!subadminCount || Number(subadminCount.count) === 0) {
      const hashed = hashPassword('ADMIN@12345')
      const timestamp = isoNow()
      await execute(
        `INSERT INTO users (id, name, role, department, password_hash, password_salt, password_scheme, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ['subadmin', 'Admin User', 'Admin', 'Admin', hashed.hash, hashed.salt, hashed.scheme, timestamp, timestamp]
      )
    }
  }

  const runnerCount = await queryOne('SELECT COUNT(*) AS count FROM runners')
  if (!runnerCount || Number(runnerCount.count) === 0) {
    await withTransaction(async conn => {
      const timestamp = isoNow()
      for (let index = 0; index < seedRunners.length; index += 1) {
        await conn.execute(
          'INSERT INTO runners (name, sort_order, created_at) VALUES (?, ?, ?)',
          [seedRunners[index], index, timestamp],
        )
      }
    })
  }

  const requestCount = await queryOne('SELECT COUNT(*) AS count FROM requests')
  if (!requestCount || Number(requestCount.count) === 0) {
    await withTransaction(async conn => {
      const timestamp = isoNow()
      for (const request of seedRequests) {
        await conn.execute(
          `INSERT INTO requests (
            id, date, employee_name, employee_id, department, request_type, priority,
            pickup_address, drop_address, contact_person, mobile_number, meeting_timing,
            description, assigned_person, lineup_timing, status, admin_comments, completion_date,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            request.id,
            request.date,
            request.employeeName,
            request.employeeId,
            request.department,
            request.requestType,
            request.priority,
            request.pickupAddress,
            request.dropAddress,
            request.contactPerson,
            request.mobileNumber,
            request.meetingTiming,
            request.description,
            request.assignedPerson,
            request.lineupTiming,
            request.status,
            request.adminComments,
            request.completionDate,
            timestamp,
            timestamp,
          ],
        )
      }
    })
  }
}

async function listPublicUsers() {
  const rows = await queryAll(
    `SELECT id, name, role, department
     FROM users
     ORDER BY CASE WHEN role = 'Super Admin' THEN 0 WHEN role = 'Admin' THEN 1 ELSE 2 END, department ASC, name ASC`,
  )
  return rows.map(publicUser)
}

async function listPrivateUsers() {
  const rows = await queryAll(
    `SELECT id, name, role, department
     FROM users
     ORDER BY CASE WHEN role = 'Super Admin' THEN 0 WHEN role = 'Admin' THEN 1 ELSE 2 END, department ASC, name ASC`,
  )
  return rows.map(privateUser)
}

async function listRunners() {
  const rows = await queryAll('SELECT name FROM runners ORDER BY sort_order ASC, name ASC')
  return rows.map(row => row.name)
}

async function listRequestsForUser(user) {
  const rows = user.role === 'Super Admin' || user.role === 'Admin'
    ? await queryAll('SELECT * FROM requests ORDER BY date DESC, created_at DESC')
    : await queryAll('SELECT * FROM requests WHERE employee_id = ? ORDER BY date DESC, created_at DESC', [user.id])
  return rows.map(requestFromRow)
}

async function buildBootstrap(user) {
  return {
    currentUser: user ? publicUser(user) : null,
    publicUsers: await listPublicUsers(),
    users: user?.role === 'Super Admin' ? await listPrivateUsers() : await listPublicUsers(),
    runners: await listRunners(),
    requests: user ? await listRequestsForUser(user) : [],
  }
}

function isWithinDistDir(filePath) {
  const resolvedDistDir = path.resolve(distDir) + path.sep
  const resolvedFilePath = path.resolve(filePath)
  return resolvedFilePath.startsWith(resolvedDistDir)
}

async function createSession(userId) {
  const token = crypto.randomUUID()
  const timestamp = isoNow()
  await execute(
    'INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
    [token, userId, timestamp, isoInDays(tokenTtlDays)],
  )
  return token
}

async function deleteSession(token) {
  if (!token) return
  await execute('DELETE FROM sessions WHERE token = ?', [token])
}

async function authUserFromToken(token) {
  if (!token) return null

  const session = await queryOne('SELECT user_id, expires_at FROM sessions WHERE token = ?', [token])
  if (!session) return null

  if (new Date(session.expires_at) < new Date()) {
    await deleteSession(token)
    return null
  }

  return queryOne('SELECT * FROM users WHERE id = ?', [session.user_id])
}

function requireAuth(res, user) {
  if (!user) {
    json(res, 401, { error: 'Authentication required.' })
    return false
  }
  return true
}

function requireAdmin(res, user) {
  if (!user) {
    json(res, 401, { error: 'Authentication required.' })
    return false
  }
  if (user.role !== 'Admin' && user.role !== 'Super Admin') {
    json(res, 403, { error: 'Admin access required.' })
    return false
  }
  return true
}

function requireSuperAdmin(res, user) {
  if (!user) {
    json(res, 401, { error: 'Authentication required.' })
    return false
  }
  if (user.role !== 'Super Admin') {
    json(res, 403, { error: 'Super Admin access required.' })
    return false
  }
  return true
}

function makeCsv(rows) {
  const headers = [
    'Ticket ID',
    'Date',
    'Employee',
    'Department',
    'Type',
    'Priority',
    'Status',
    'Assigned To',
    'Pickup Address',
    'Drop Address',
    'Contact Person',
    'Mobile Number',
    'Meeting Timing',
    'Lineup Timing',
    'Description',
    'Admin Comments',
    'Completion Date',
  ]

  const escapeCsv = value => {
    const textValue = value == null ? '' : String(value)
    if (/[",\n]/.test(textValue)) {
      return `"${textValue.replace(/"/g, '""')}"`
    }
    return textValue
  }

  const lines = [headers.map(escapeCsv).join(',')]
  for (const row of rows) {
    lines.push([
      row.id,
      row.date,
      row.employeeName,
      row.department,
      row.requestType,
      row.priority,
      row.status,
      row.assignedPerson,
      row.pickupAddress,
      row.dropAddress,
      row.contactPerson,
      row.mobileNumber,
      row.meetingTiming,
      row.lineupTiming,
      row.description,
      row.adminComments,
      row.completionDate,
    ].map(escapeCsv).join(','))
  }

  return `${lines.join('\n')}\n`
}

async function handleApi(req, res, url) {
  if (url.pathname === '/api/bootstrap' && req.method === 'GET') {
    const user = await authUserFromToken(getBearerToken(req))
    json(res, 200, await buildBootstrap(user))
    return true
  }

  if (url.pathname === '/api/auth/login' && req.method === 'POST') {
    const body = await readBody(req)
    const user = await queryOne('SELECT * FROM users WHERE id = ?', [body.userId])
    if (!user || !verifyPassword(body.password || '', user)) {
      json(res, 401, { error: 'Incorrect username or password.' })
      return true
    }

    const token = await createSession(user.id)
    json(res, 200, {
      token,
      user: publicUser(user),
    })
    return true
  }

  if (url.pathname === '/api/auth/logout' && req.method === 'POST') {
    await deleteSession(getBearerToken(req))
    json(res, 200, { ok: true })
    return true
  }

  if (url.pathname === '/api/me' && req.method === 'GET') {
    const user = await authUserFromToken(getBearerToken(req))
    if (!user) {
      json(res, 401, { error: 'Not authenticated.' })
      return true
    }
    json(res, 200, { user: publicUser(user) })
    return true
  }

  if (url.pathname === '/api/requests/export' && req.method === 'GET') {
    const user = await authUserFromToken(getBearerToken(req))
    if (!requireAuth(res, user)) return true
    const rows = await listRequestsForUser(user)
    text(res, 200, makeCsv(rows), 'text/csv; charset=utf-8')
    return true
  }

  if (url.pathname.match(/^\/api\/requests\/[^/]+$/) && req.method === 'GET') {
    const user = await authUserFromToken(getBearerToken(req))
    if (!requireAuth(res, user)) return true

    const requestId = decodeURIComponent(url.pathname.split('/').pop() || '')
    const requestRow = await queryOne('SELECT * FROM requests WHERE id = ?', [requestId])
    if (!requestRow) {
      json(res, 404, { error: 'Request not found.' })
      return true
    }

    if (user.role !== 'Super Admin' && user.role !== 'Admin' && requestRow.employee_id !== user.id) {
      json(res, 403, { error: 'You can only view your own requests.' })
      return true
    }

    json(res, 200, { request: requestFromRow(requestRow) })
    return true
  }

  if (url.pathname === '/api/requests' && req.method === 'POST') {
    const user = await authUserFromToken(getBearerToken(req))
    if (!requireAuth(res, user)) return true
    if (user.role !== 'Employee') {
      json(res, 403, { error: 'Only employees can create requests.' })
      return true
    }

    const body = await readBody(req)
    if (!body.mobileNumber || String(body.mobileNumber).replace(/\D/g, '').length !== 10) {
      json(res, 400, { error: 'Mobile number must be exactly 10 digits.' })
      return true
    }

    const meetingTiming = body.meetingTiming ? new Date(body.meetingTiming) : null
    if (!meetingTiming || Number.isNaN(meetingTiming.getTime())) {
      json(res, 400, { error: 'Meeting timing is required.' })
      return true
    }
    if (meetingTiming < new Date()) {
      json(res, 400, { error: 'Meeting timing cannot be in the past.' })
      return true
    }

    const request = {
      id: '',
      date: isoNow(),
      employeeName: user.name,
      employeeId: user.id,
      department: user.department,
      requestType: body.requestType || 'Pick-up',
      priority: body.priority || 'Medium',
      pickupAddress: String(body.pickupAddress || '').trim(),
      dropAddress: String(body.dropAddress || '').trim(),
      contactPerson: String(body.contactPerson || '').trim(),
      mobileNumber: String(body.mobileNumber || '').replace(/\D/g, '').slice(0, 10),
      meetingTiming: String(body.meetingTiming || ''),
      description: String(body.description || '').trim(),
      assignedPerson: '',
      lineupTiming: '',
      status: 'Pending',
      adminComments: '',
      completionDate: null,
    }

    const requiredFields = ['pickupAddress', 'dropAddress', 'contactPerson', 'description']
    if (requiredFields.some(field => !request[field])) {
      json(res, 400, { error: 'All request fields are required.' })
      return true
    }

    let ticketId = ''
    do {
      ticketId = `TKT-${Math.floor(1000 + Math.random() * 9000)}`
    } while (await queryOne('SELECT 1 FROM requests WHERE id = ?', [ticketId]))
    request.id = ticketId

    await execute(
      `INSERT INTO requests (
        id, date, employee_name, employee_id, department, request_type, priority,
        pickup_address, drop_address, contact_person, mobile_number, meeting_timing,
        description, assigned_person, lineup_timing, status, admin_comments, completion_date,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        request.id,
        request.date,
        request.employeeName,
        request.employeeId,
        request.department,
        request.requestType,
        request.priority,
        request.pickupAddress,
        request.dropAddress,
        request.contactPerson,
        request.mobileNumber,
        request.meetingTiming,
        request.description,
        request.assignedPerson,
        request.lineupTiming,
        request.status,
        request.adminComments,
        request.completionDate,
        isoNow(),
        isoNow(),
      ],
    )

    json(res, 201, { request })
    return true
  }

  if (url.pathname.match(/^\/api\/requests\/[^/]+$/) && req.method === 'PATCH') {
    const user = await authUserFromToken(getBearerToken(req))
    if (!requireAdmin(res, user)) return true

    const requestId = decodeURIComponent(url.pathname.split('/').pop() || '')
    const existing = await queryOne('SELECT * FROM requests WHERE id = ?', [requestId])
    if (!existing) {
      json(res, 404, { error: 'Request not found.' })
      return true
    }

    const body = await readBody(req)
    const nextStatus = body.status || existing.status
    const nextCompletionDate = nextStatus === 'Completed'
      ? existing.completion_date || isoNow()
      : existing.completion_date

    await execute(
      `UPDATE requests
       SET status = ?, assigned_person = ?, lineup_timing = ?, admin_comments = ?, completion_date = ?, updated_at = ?
       WHERE id = ?`,
      [
        nextStatus,
        String(body.assignedPerson ?? existing.assigned_person ?? ''),
        String(body.lineupTiming ?? existing.lineup_timing ?? ''),
        String(body.adminComments ?? existing.admin_comments ?? ''),
        nextCompletionDate,
        isoNow(),
        requestId,
      ],
    )

    const updated = await queryOne('SELECT * FROM requests WHERE id = ?', [requestId])
    json(res, 200, { request: requestFromRow(updated) })
    return true
  }

  if (url.pathname === '/api/runners' && req.method === 'POST') {
    const user = await authUserFromToken(getBearerToken(req))
    if (!requireSuperAdmin(res, user)) return true

    const body = await readBody(req)
    const name = String(body.name || '').trim()
    if (!name) {
      json(res, 400, { error: 'Runner name is required.' })
      return true
    }

    const exists = await queryOne('SELECT 1 FROM runners WHERE name = ?', [name])
    if (exists) {
      json(res, 409, { error: 'Runner already exists.' })
      return true
    }

    const maxSortOrder = await queryOne('SELECT COALESCE(MAX(sort_order), 0) AS maxSortOrder FROM runners')
    await execute('INSERT INTO runners (name, sort_order, created_at) VALUES (?, ?, ?)', [name, Number(maxSortOrder.maxSortOrder) + 1, isoNow()])
    json(res, 201, { ok: true })
    return true
  }

  if (url.pathname.match(/^\/api\/runners\/[^/]+$/) && req.method === 'DELETE') {
    const user = await authUserFromToken(getBearerToken(req))
    if (!requireSuperAdmin(res, user)) return true

    const name = decodeURIComponent(url.pathname.split('/').pop() || '')
    await execute('DELETE FROM runners WHERE name = ?', [name])
    json(res, 200, { ok: true })
    return true
  }

  if (url.pathname === '/api/users' && req.method === 'POST') {
    const user = await authUserFromToken(getBearerToken(req))
    if (!requireSuperAdmin(res, user)) return true

    const body = await readBody(req)
    const id = String(body.id || '').trim().toLowerCase().replace(/\s+/g, '')
    const name = String(body.name || '').trim()
    const department = String(body.department || '').trim()
    const password = String(body.password || `ZTRACK-${crypto.randomBytes(4).toString('hex').toUpperCase()}`).trim()

    if (!id || !name || !department) {
      json(res, 400, { error: 'Login ID, name, and department are required.' })
      return true
    }

    const existing = await queryOne('SELECT 1 FROM users WHERE id = ?', [id])
    if (existing) {
      json(res, 409, { error: 'Login ID already exists.' })
      return true
    }

    const hashed = hashPassword(password)
    const timestamp = isoNow()
    await execute(
      `INSERT INTO users
       (id, name, role, department, password_hash, password_salt, password_scheme, created_at, updated_at)
       VALUES (?, ?, 'Employee', ?, ?, ?, ?, ?, ?)`,
      [id, name, department, hashed.hash, hashed.salt, hashed.scheme, timestamp, timestamp],
    )

    const created = await queryOne('SELECT id, name, role, department FROM users WHERE id = ?', [id])
    json(res, 201, { user: privateUser(created), temporaryPassword: password })
    return true
  }

  if (url.pathname.match(/^\/api\/users\/[^/]+$/) && req.method === 'DELETE') {
    const user = await authUserFromToken(getBearerToken(req))
    if (!requireSuperAdmin(res, user)) return true

    const id = decodeURIComponent(url.pathname.split('/').pop() || '')
    if (id === 'admin') {
      json(res, 400, { error: 'Admin account cannot be removed.' })
      return true
    }

    await execute('DELETE FROM users WHERE id = ?', [id])
    await execute('DELETE FROM sessions WHERE user_id = ?', [id])
    json(res, 200, { ok: true })
    return true
  }

  if (url.pathname.match(/^\/api\/users\/[^/]+\/reset-password$/) && req.method === 'POST') {
    const user = await authUserFromToken(getBearerToken(req))
    if (!requireSuperAdmin(res, user)) return true

    const id = decodeURIComponent(url.pathname.split('/')[3] || '')
    const existing = await queryOne('SELECT id FROM users WHERE id = ?', [id])
    if (!existing) {
      json(res, 404, { error: 'User not found.' })
      return true
    }

    const password = `ZTRACK-${crypto.randomBytes(4).toString('hex').toUpperCase()}`
    const hashed = hashPassword(password)
    await execute(
      `UPDATE users
       SET password_hash = ?, password_salt = ?, password_scheme = ?, updated_at = ?
       WHERE id = ?`,
      [hashed.hash, hashed.salt, hashed.scheme, isoNow(), id],
    )

    json(res, 200, { password })
    return true
  }

  return false
}

async function serveRequest(req, res, vite) {
  const url = new URL(req.url || '/', 'http://localhost')

  if (url.pathname === '/healthz' && req.method === 'GET') {
    json(res, 200, {
      ok: true,
      status: 'healthy',
      mode: isProd ? 'production' : 'development',
      uptimeSeconds: Math.floor(process.uptime()),
    })
    return
  }

  if (url.pathname.startsWith('/api/')) {
    try {
      const handled = await handleApi(req, res, url)
      if (handled) return
    } catch (error) {
      console.error(error)
      json(res, 500, { error: 'Server error.' })
      return
    }
  }

  if (isProd) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      text(res, 405, 'Method Not Allowed')
      return
    }

    const cleanedPath = decodeURIComponent(url.pathname)
    const filePath = path.resolve(distDir, cleanedPath === '/' ? 'index.html' : cleanedPath.replace(/^\//, ''))
    if (!isWithinDistDir(filePath)) {
      text(res, 403, 'Forbidden')
      return
    }

    if (cleanedPath !== '/' && existsSync(filePath) && statSync(filePath).isFile()) {
      res.writeHead(200, { 'Content-Type': getMimeType(filePath) })
      createReadStream(filePath).pipe(res)
      return
    }

    const indexPath = path.join(distDir, 'index.html')
    const html = readFileSync(indexPath, 'utf8')
    text(res, 200, html, 'text/html; charset=utf-8')
    return
  }

  vite.middlewares(req, res, async () => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      text(res, 405, 'Method Not Allowed')
      return
    }

    const indexPath = path.join(rootDir, 'index.html')
    const template = await readFile(indexPath, 'utf8')
    const html = await vite.transformIndexHtml(url.pathname, template)
    text(res, 200, html, 'text/html; charset=utf-8')
  })
}

async function createPoolForApp() {
  const bootstrap = await mysql.createConnection({
    host: dbHost,
    port: dbPort,
    user: dbUser,
    password: dbPassword,
  })

  await bootstrap.query(
    `CREATE DATABASE IF NOT EXISTS \`${dbName.replace(/`/g, '')}\`
     CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  )
  await bootstrap.end()

  return mysql.createPool({
    host: dbHost,
    port: dbPort,
    user: dbUser,
    password: dbPassword,
    database: dbName,
    waitForConnections: true,
    connectionLimit: 10,
    namedPlaceholders: false,
  })
}

async function shutdown(signal) {
  if (shuttingDown) return
  shuttingDown = true

  console.log(`${signal} received, shutting down gracefully...`)

  try {
    if (server) {
      await new Promise(resolve => server.close(resolve))
    }
  } catch (error) {
    console.error('Failed to close HTTP server cleanly:', error)
  }

  try {
    if (pool) {
      await pool.end()
    }
  } catch (error) {
    console.error('Failed to close database pool cleanly:', error)
  }

  process.exit(0)
}

async function main() {
  assertProductionConfig()
  pool = await createPoolForApp()
  await initSchema()
  await seedDatabase()

  let vite = null
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite')
    vite = await createViteServer({
      root: rootDir,
      appType: 'custom',
      server: { middlewareMode: true },
    })
  }

  server = http.createServer((req, res) => {
    void serveRequest(req, res, vite)
  })
  server.requestTimeout = 30_000
  server.headersTimeout = 35_000
  server.keepAliveTimeout = 65_000

  server.listen(port, '0.0.0.0', () => {
    const mode = isProd ? 'production' : 'development'
    console.log(`Z-Track server running on http://0.0.0.0:${port} (${mode})`)
  })
}

process.on('SIGINT', () => {
  void shutdown('SIGINT')
})

process.on('SIGTERM', () => {
  void shutdown('SIGTERM')
})

process.on('unhandledRejection', error => {
  console.error('Unhandled promise rejection:', error)
  if (isProd) process.exit(1)
})

process.on('uncaughtException', error => {
  console.error('Uncaught exception:', error)
  process.exit(1)
})

main().catch(error => {
  console.error(error)
  process.exit(1)
})
