import http.client
import tempfile
import threading
from pathlib import Path
from urllib.parse import urlencode
from http.server import ThreadingHTTPServer
import app

with tempfile.TemporaryDirectory() as tmp:
    app.DB = Path(tmp) / 'test.sqlite3'
    app.init()
    server = ThreadingHTTPServer(('127.0.0.1', 0), app.App)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    port = server.server_address[1]
    def request(method, path, values=None):
        con = http.client.HTTPConnection('127.0.0.1', port)
        data = urlencode(values) if values is not None else None
        con.request(method, path, data, {'Content-Type':'application/x-www-form-urlencoded'} if data is not None else {})
        res = con.getresponse()
        body = res.read().decode()
        result = (res.status, res.getheader('Location'), body)
        con.close()
        return result
    assert request('GET','/')[0] == 200
    with app.db() as con:
        chur = con.execute("SELECT id FROM products WHERE name='Churrasco'").fetchone()[0]
        limo = con.execute("SELECT id FROM products WHERE name='Limonada' AND presentation='Jarra'").fetchone()[0]
    assert request('POST','/abrir-caja',{'opening':'100'})[:2] == (303,'/caja')
    assert request('POST','/borrador',{f'p_{chur}':'2',f'p_{limo}':'1','customer_name':'Ana'})[0] == 303
    customer = request('GET','/cliente')[2]
    assert 'Bs 175.00' in customer and 'Ana' in customer and 'Monto a cancelar' in customer
    status, location, _ = request('POST','/cobrar',{'payment':'QR'})
    assert status == 303 and location.startswith('/ficha/')
    assert 'Total pagado: Bs 175.00' in request('GET',location)[2]
    assert 'Su ficha es' in request('GET','/cliente')[2]
    cash = request('GET','/caja')[2]
    assert 'Ventas QR: Bs 175.00' in cash and 'Efectivo esperado: Bs 100.00' in cash
    assert request('POST','/cobrar',{'payment':'QR'})[0] == 400
    assert request('POST','/cerrar-caja',{'counted':'100'})[0] == 303
    assert 'Diferencia: Bs 0.00' in request('GET','/caja')[2]
    assert request('POST','/empleado',{'name':'Luis','role':'Cocina','full_rate':'100','half_rate':'60'})[0] == 303
    with app.db() as con:
        staff_id = con.execute("SELECT id FROM staff WHERE name='Luis'").fetchone()[0]
    assert request('POST','/jornada',{'staff_id':staff_id,'work_date':'2026-11-07','planned':'completo','worked':'medio'})[0] == 303
    assert request('POST','/pago-personal',{'staff_id':staff_id,'kind':'adelanto','amount':'20'})[0] == 303
    staff = request('GET','/personal')[2]
    assert 'Bs 60.00' in staff and 'Bs 40.00' in staff
    server.shutdown()
    server.server_close()
    thread.join()
print('Prueba integral OK: pedido, segunda pantalla, ficha, caja QR y medio turno')
