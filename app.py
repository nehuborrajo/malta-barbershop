from flask import Flask, render_template, request, jsonify
from flask_cors import CORS
from datetime import datetime, timedelta
import sqlite3
import os

app = Flask(__name__)
CORS(app)

DATABASE = 'barberia.db'

def get_db():
    """Obtener conexión a la base de datos."""
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    """Inicializar la base de datos con las tablas necesarias."""
    conn = get_db()
    cursor = conn.cursor()

    # Tabla de servicios/precios
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS servicios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT NOT NULL UNIQUE,
            precio REAL NOT NULL,
            activo INTEGER DEFAULT 1
        )
    ''')

    # Insertar servicios por defecto si no existen
    servicios_default = [
        ('Corte', 0),
        ('Corte + Barba', 0),
        ('Color', 0),
        ('Personalizado', 0)
    ]
    for nombre, precio in servicios_default:
        cursor.execute(
            'INSERT OR IGNORE INTO servicios (nombre, precio) VALUES (?, ?)',
            (nombre, precio)
        )

    # Tabla de turnos fijos
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS turnos_fijos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre_cliente TEXT NOT NULL,
            dia_semana INTEGER NOT NULL,
            horario TEXT NOT NULL,
            servicio_id INTEGER,
            activo INTEGER DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (servicio_id) REFERENCES servicios(id)
        )
    ''')

    # Tabla de turnos
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS turnos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            fecha DATE NOT NULL,
            horario TEXT NOT NULL,
            nombre_cliente TEXT NOT NULL,
            servicio_id INTEGER,
            turno_fijo_id INTEGER,
            estado TEXT DEFAULT 'pendiente',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (servicio_id) REFERENCES servicios(id),
            FOREIGN KEY (turno_fijo_id) REFERENCES turnos_fijos(id)
        )
    ''')

    # Tabla de pagos
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS pagos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            turno_id INTEGER NOT NULL,
            monto REAL NOT NULL,
            medio_pago TEXT NOT NULL,
            fecha_hora TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (turno_id) REFERENCES turnos(id)
        )
    ''')

    # Migración: agregar columna servicio_id si no existe en turnos_fijos
    try:
        cursor.execute('ALTER TABLE turnos_fijos ADD COLUMN servicio_id INTEGER')
    except:
        pass

    # Migración: agregar columna servicio_id si no existe en turnos
    try:
        cursor.execute('ALTER TABLE turnos ADD COLUMN servicio_id INTEGER')
    except:
        pass

    conn.commit()
    conn.close()

# ============ RUTAS DE PÁGINAS ============

@app.route('/')
def index():
    return render_template('index.html')

# ============ API SERVICIOS ============

@app.route('/api/servicios', methods=['GET'])
def get_servicios():
    conn = get_db()
    servicios = conn.execute('SELECT * FROM servicios WHERE activo = 1 ORDER BY id').fetchall()
    conn.close()
    return jsonify([dict(s) for s in servicios])

@app.route('/api/servicios/<int:id>', methods=['PUT'])
def update_servicio(id):
    data = request.json
    conn = get_db()
    conn.execute(
        'UPDATE servicios SET precio = ? WHERE id = ?',
        (data['precio'], id)
    )
    conn.commit()
    conn.close()
    return jsonify({'message': 'Precio actualizado'})

# ============ API TURNOS FIJOS ============

@app.route('/api/turnos-fijos', methods=['GET'])
def get_turnos_fijos():
    conn = get_db()
    turnos = conn.execute('''
        SELECT tf.*, s.nombre as servicio_nombre, s.precio as servicio_precio
        FROM turnos_fijos tf
        LEFT JOIN servicios s ON tf.servicio_id = s.id
        WHERE tf.activo = 1
        ORDER BY tf.dia_semana, tf.horario
    ''').fetchall()
    conn.close()
    return jsonify([dict(t) for t in turnos])

@app.route('/api/turnos-fijos', methods=['POST'])
def create_turno_fijo():
    data = request.json
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        'INSERT INTO turnos_fijos (nombre_cliente, dia_semana, horario, servicio_id) VALUES (?, ?, ?, ?)',
        (data['nombre_cliente'], data['dia_semana'], data['horario'], data.get('servicio_id'))
    )
    conn.commit()
    turno_id = cursor.lastrowid
    conn.close()
    return jsonify({'id': turno_id, 'message': 'Turno fijo creado'}), 201

@app.route('/api/turnos-fijos/<int:id>', methods=['PUT'])
def update_turno_fijo(id):
    data = request.json
    conn = get_db()
    conn.execute(
        'UPDATE turnos_fijos SET nombre_cliente = ?, dia_semana = ?, horario = ?, servicio_id = ? WHERE id = ?',
        (data['nombre_cliente'], data['dia_semana'], data['horario'], data.get('servicio_id'), id)
    )
    conn.commit()
    conn.close()
    return jsonify({'message': 'Turno fijo actualizado'})

@app.route('/api/turnos-fijos/<int:id>', methods=['DELETE'])
def delete_turno_fijo(id):
    conn = get_db()
    conn.execute('UPDATE turnos_fijos SET activo = 0 WHERE id = ?', (id,))
    conn.commit()
    conn.close()
    return jsonify({'message': 'Turno fijo eliminado'})

# ============ API TURNOS ============

@app.route('/api/turnos', methods=['GET'])
def get_turnos():
    fecha_inicio = request.args.get('fecha_inicio')
    fecha_fin = request.args.get('fecha_fin')

    conn = get_db()

    if fecha_inicio and fecha_fin:
        turnos = conn.execute(
            '''SELECT t.*, p.monto, p.medio_pago, s.nombre as servicio_nombre, s.precio as servicio_precio
               FROM turnos t
               LEFT JOIN pagos p ON t.id = p.turno_id
               LEFT JOIN servicios s ON t.servicio_id = s.id
               WHERE t.fecha BETWEEN ? AND ?
               ORDER BY t.fecha, t.horario''',
            (fecha_inicio, fecha_fin)
        ).fetchall()
    else:
        turnos = conn.execute(
            '''SELECT t.*, p.monto, p.medio_pago, s.nombre as servicio_nombre, s.precio as servicio_precio
               FROM turnos t
               LEFT JOIN pagos p ON t.id = p.turno_id
               LEFT JOIN servicios s ON t.servicio_id = s.id
               ORDER BY t.fecha DESC, t.horario LIMIT 100'''
        ).fetchall()

    conn.close()
    return jsonify([dict(t) for t in turnos])

@app.route('/api/turnos', methods=['POST'])
def create_turno():
    data = request.json
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        'INSERT INTO turnos (fecha, horario, nombre_cliente, servicio_id, turno_fijo_id, estado) VALUES (?, ?, ?, ?, ?, ?)',
        (data['fecha'], data['horario'], data['nombre_cliente'], data.get('servicio_id'), data.get('turno_fijo_id'), 'pendiente')
    )
    conn.commit()
    turno_id = cursor.lastrowid
    conn.close()
    return jsonify({'id': turno_id, 'message': 'Turno creado'}), 201

@app.route('/api/turnos/<int:id>', methods=['PUT'])
def update_turno(id):
    data = request.json
    conn = get_db()
    conn.execute(
        'UPDATE turnos SET fecha = ?, horario = ?, nombre_cliente = ?, servicio_id = ?, estado = ? WHERE id = ?',
        (data['fecha'], data['horario'], data['nombre_cliente'], data.get('servicio_id'), data.get('estado', 'pendiente'), id)
    )
    conn.commit()
    conn.close()
    return jsonify({'message': 'Turno actualizado'})

@app.route('/api/turnos/<int:id>/cancelar', methods=['POST'])
def cancelar_turno(id):
    conn = get_db()
    conn.execute('UPDATE turnos SET estado = ? WHERE id = ?', ('cancelado', id))
    conn.commit()
    conn.close()
    return jsonify({'message': 'Turno cancelado'})

@app.route('/api/turnos/<int:id>/completar', methods=['POST'])
def completar_turno(id):
    data = request.json
    conn = get_db()
    cursor = conn.cursor()

    # Actualizar estado del turno
    cursor.execute('UPDATE turnos SET estado = ? WHERE id = ?', ('completado', id))

    # Registrar pago
    cursor.execute(
        'INSERT INTO pagos (turno_id, monto, medio_pago) VALUES (?, ?, ?)',
        (id, data['monto'], data['medio_pago'])
    )

    conn.commit()
    conn.close()
    return jsonify({'message': 'Turno completado y pago registrado'})

# ============ API GENERAR TURNOS DESDE FIJOS ============

@app.route('/api/generar-turnos-semana', methods=['POST'])
def generar_turnos_semana():
    """Genera los turnos de la semana actual basándose en los turnos fijos."""
    data = request.json
    fecha_inicio = datetime.strptime(data['fecha_inicio'], '%Y-%m-%d')

    conn = get_db()
    cursor = conn.cursor()

    # Obtener turnos fijos activos
    turnos_fijos = conn.execute('SELECT * FROM turnos_fijos WHERE activo = 1').fetchall()

    turnos_creados = 0
    for tf in turnos_fijos:
        # Calcular la fecha correspondiente a ese día de la semana
        dias_diferencia = (tf['dia_semana'] - fecha_inicio.weekday()) % 7
        fecha_turno = fecha_inicio + timedelta(days=dias_diferencia)
        fecha_str = fecha_turno.strftime('%Y-%m-%d')

        # Verificar si ya existe un turno para ese día/horario/cliente
        existe = conn.execute(
            'SELECT id FROM turnos WHERE fecha = ? AND horario = ? AND turno_fijo_id = ?',
            (fecha_str, tf['horario'], tf['id'])
        ).fetchone()

        if not existe:
            cursor.execute(
                'INSERT INTO turnos (fecha, horario, nombre_cliente, servicio_id, turno_fijo_id, estado) VALUES (?, ?, ?, ?, ?, ?)',
                (fecha_str, tf['horario'], tf['nombre_cliente'], tf['servicio_id'], tf['id'], 'pendiente')
            )
            turnos_creados += 1

    conn.commit()
    conn.close()
    return jsonify({'message': f'{turnos_creados} turnos generados'})

# ============ API PAGOS ============

@app.route('/api/pagos', methods=['GET'])
def get_pagos():
    fecha_inicio = request.args.get('fecha_inicio')
    fecha_fin = request.args.get('fecha_fin')
    medio_pago = request.args.get('medio_pago')

    conn = get_db()

    query = '''
        SELECT p.*, t.fecha, t.nombre_cliente, s.nombre as servicio_nombre
        FROM pagos p
        JOIN turnos t ON p.turno_id = t.id
        LEFT JOIN servicios s ON t.servicio_id = s.id
        WHERE 1=1
    '''
    params = []

    if fecha_inicio and fecha_fin:
        query += ' AND t.fecha BETWEEN ? AND ?'
        params.extend([fecha_inicio, fecha_fin])

    if medio_pago:
        query += ' AND p.medio_pago = ?'
        params.append(medio_pago)

    query += ' ORDER BY p.fecha_hora DESC'

    pagos = conn.execute(query, params).fetchall()
    conn.close()
    return jsonify([dict(p) for p in pagos])

# ============ API MÉTRICAS ============

@app.route('/api/metricas', methods=['GET'])
def get_metricas():
    fecha_inicio = request.args.get('fecha_inicio')
    fecha_fin = request.args.get('fecha_fin')

    conn = get_db()

    # Total de ingresos
    total = conn.execute(
        '''SELECT COALESCE(SUM(p.monto), 0) as total
           FROM pagos p
           JOIN turnos t ON p.turno_id = t.id
           WHERE t.fecha BETWEEN ? AND ?''',
        (fecha_inicio, fecha_fin)
    ).fetchone()

    # Desglose por medio de pago
    por_medio = conn.execute(
        '''SELECT p.medio_pago, COALESCE(SUM(p.monto), 0) as total, COUNT(*) as cantidad
           FROM pagos p
           JOIN turnos t ON p.turno_id = t.id
           WHERE t.fecha BETWEEN ? AND ?
           GROUP BY p.medio_pago''',
        (fecha_inicio, fecha_fin)
    ).fetchall()

    # Ingresos por día
    por_dia = conn.execute(
        '''SELECT t.fecha, COALESCE(SUM(p.monto), 0) as total, COUNT(*) as cantidad
           FROM pagos p
           JOIN turnos t ON p.turno_id = t.id
           WHERE t.fecha BETWEEN ? AND ?
           GROUP BY t.fecha
           ORDER BY t.fecha''',
        (fecha_inicio, fecha_fin)
    ).fetchall()

    # Cantidad de turnos por estado
    turnos_stats = conn.execute(
        '''SELECT estado, COUNT(*) as cantidad
           FROM turnos
           WHERE fecha BETWEEN ? AND ?
           GROUP BY estado''',
        (fecha_inicio, fecha_fin)
    ).fetchall()

    conn.close()

    return jsonify({
        'total': total['total'],
        'por_medio_pago': [dict(p) for p in por_medio],
        'por_dia': [dict(p) for p in por_dia],
        'turnos_por_estado': [dict(t) for t in turnos_stats]
    })

if __name__ == '__main__':
    init_db()
    app.run(debug=True, port=5000)
