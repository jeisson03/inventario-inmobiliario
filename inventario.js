/* ============================================================
   Inventario Escrito — complemento de escritura del inventario
   Config + lógica: formulario, dictado por voz, PDF, Drive.
   ============================================================ */
(function () {
  'use strict';

  var API_URL = 'https://script.google.com/macros/s/AKfycbyhvbWHwq-Xw35_we32bCvGP-TwpzhXG-Df_DDQDRlNExZAuAA5F26S2jVL0GWM4gXM/exec';

  /* ---------- Datos del formulario (fiel al PDF original) ---------- */
  var ITEMS_ALCOBA = ['PUERTA', 'CERRADURA', 'VIDRIOS', 'CORTINAS', 'REJAS', 'PISOS', 'PAREDES', 'TECHO', 'TOMAS', 'INTERRUPTORES', 'PLAFON', 'APLIQUES', 'LAMPARAS', 'GUARDAESCOBAS', 'CLOSET/VESTIER', 'PUERTAS', 'CAJONES'];
  var ITEMS_BANO = ['PUERTA', 'CERRADURA', 'CABINA', 'LAVAMANOS', 'GRIFERIA', 'SANITARIO', 'TOALLERO', 'JABONERA', 'CEPILLERA', 'REGADERA', 'ESPEJOS', 'GABINETE', 'PISOS', 'PAREDES', 'TECHOS', 'TOMAS', 'ROSETAS', 'INTERRUPTORES', 'PORTA PAPEL'];

  var ZONAS = [
    { nombre: 'GENERAL', items: ['PUERTA PRINCIPAL', 'CERRADURA PUERTA PRINCIPAL', 'OTRAS PUERTAS', 'CERRADURA OTRAS PUERTAS', 'VENTANAS', 'REJAS', 'PISOS', 'TIMBRE', 'PAREDES (GENERALES)', 'TECHO (GENERAL)', 'DIVISIONES', 'ESCALERAS', 'PAREDES DEL PASILLO', 'GUARDA ESCOBAS DEL PASILLO', 'PISO DEL PASILLO', 'ADICIONALES EN PASILLO'] },
    { nombre: 'ZONA DE ROPAS', items: ['PUERTA', 'CERRADURA', 'PISOS', 'PAREDES', 'TECHOS', 'TOMAS', 'INTERRUPTORES', 'PLAFON', 'INSTALACIONES LAVADORA', 'LAVADERO', 'TENDEDERO DE ROPAS', 'VENTANAS'] },
    { nombre: 'COCINA O COCINETA', items: ['PUERTA', 'CERRADURA', 'VIDRIOS', 'PISOS', 'PAREDES', 'TECHOS', 'TOMAS', 'INTERRUPTORES', 'PLAFON', 'LAVAPLATOS', 'GRIFERIA', 'REJILLA LAVAPLATOS', 'MESON', 'CUBIERTA', 'HORNO', 'MUEBLES SUPERIOR', 'MUEBLE INFERIOR', 'CALENTADOR', 'CAMPANA EXTRACTORA', 'CILINDRO DE GAS', 'BARRA AMERICANA'] },
    { nombre: 'ALCOBA PRINCIPAL', items: ITEMS_ALCOBA.slice() },
    { nombre: 'ALCOBA No 2', items: ITEMS_ALCOBA.slice() },
    { nombre: 'ALCOBA No 3', items: ITEMS_ALCOBA.slice() },
    { nombre: 'ALCOBA No 4', items: ITEMS_ALCOBA.slice() },
    { nombre: 'BAÑO SOCIAL', items: ITEMS_BANO.slice() },
    { nombre: 'BAÑO PRINCIPAL', items: ITEMS_BANO.slice() },
    { nombre: 'BAÑO AUXILIAR', items: ITEMS_BANO.slice() },
    { nombre: 'SALA COMEDOR', items: ['PUERTA', 'CERRADURA', 'VIDRIOS', 'PAREDES', 'REJAS', 'PISOS', 'TECHO', 'TOMAS', 'INTERRUPTORES', 'ROSETAS', 'LAMPARAS', 'GUARDAESCOBAS', 'CHIMENEA', 'PUERTAS'] },
    { nombre: 'COMEDOR AUXILIAR', items: ['PUERTA', 'CERRADURA', 'VIDRIOS', 'PAREDES', 'REJAS', 'PISOS', 'TECHO', 'TOMAS', 'INTERRUPTORES', 'ROSETAS', 'LAMPARAS', 'GUARDAESCOBAS'] },
    { nombre: 'BALCON', items: ['PISOS', 'PAREDES', 'TECHOS', 'TOMAS', 'INTERRUPTORES', 'ROSETAS', 'LAMPARAS', 'PASAMANOS'] },
    { nombre: 'CUARTO UTIL / GARAJE', items: ['PUERTA', 'CERRADURA', 'REJAS', 'PISOS', 'TECHO', 'TOMAS', 'INTERRUPTORES'] },
    { nombre: 'ELEMENTOS ELECTRONICOS', items: ['CITOFONOS', 'INTERRUPTORES', 'CAJA FUSIBLES'] }
  ];

  var LLAVES = ['PUERTA PRINCIPAL', 'CHAPA 1', 'CHAPA 2', 'ALCOBA PRINCIPAL', 'ALCOBA No 2', 'ALCOBA No 3', 'ALCOBA No 4', 'ALCOBA DE SERVICIO', 'CUARTO UTIL', 'COCINA', 'GARAJE', 'CLOSET 1', 'CLOSET 2', 'CLOSET 3', 'CLOSET 4', 'VESTIER', 'REJAS', 'CONTROL REMOTO', 'CARNET'];

  /* ---------- Estado ---------- */
  var estado = null;      // datos del formulario actual
  var carpetaId = '';     // id real en Drive (o local_* si aun no se sube)
  var SB_WA = false;      // soporte de reconocimiento de voz
  var sesionDict = null;  // sesión de dictado activa (ver __invMic)

  /* ---------- Utilidades ---------- */
  function $(id) { return document.getElementById(id); }

  function estaOnline() { return navigator.onLine; }

  function apiGet(params) {
    var qs = '';
    for (var k in params) { qs += (qs ? '&' : '?') + k + '=' + encodeURIComponent(params[k]); }
    return fetch(API_URL + qs).then(function (r) { return r.json(); }).catch(function () { return null; });
  }

  /* Busca la carpeta del inmueble (buscarOCrear); si el backend aun no lo tiene,
     cae a la accion 'crear' que ya existia. */
  function obtenerCarpeta(nombre) {
    return apiGet({ action: 'buscarOCrear', nombre: nombre }).then(function (r) {
      if (r && r.success) return r;
      return apiGet({ action: 'crear', nombre: nombre });
    });
  }

  function limpio(s) { return (s || '').trim().replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '_'); }

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function texto(val) { return (val == null ? '' : String(val)).trim(); }

  function hoyISO() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function fmtFecha(iso) {
    if (!iso) return '';
    var p = iso.split('-');
    if (p.length !== 3) return texto(iso);
    return p[2] + '/' + p[1] + '/' + p[0];
  }

  function claveLocal() { return 'invEscrito_' + (carpetaId || 'temp'); }
  function guardarEstadoLocal() {
    if (!estado) return;
    try { localStorage.setItem(claveLocal(), JSON.stringify(estado)); } catch (e) {}
  }
  function cargarEstadoLocal() {
    try {
      var raw = localStorage.getItem(claveLocal());
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function borrarEstadoLocal() {
    try { localStorage.removeItem(claveLocal()); } catch (e) {}
  }

  var autosaveT = null;
  function programarAutosave() {
    if (!estado) return;
    if (autosaveT) clearTimeout(autosaveT);
    autosaveT = setTimeout(guardarEstadoLocal, 400);
  }

  function sincronizarDesdeForm() {
    if (!estado) return;
    estado.nombre = $('input-nombre').value.trim();
    estado.unidad = $('f_unidad').value;
    estado.arrendador = $('f_arrendador').value;
    estado.arrendatario = $('f_arrendatario').value;
    estado.direccion = $('f_direccion').value;
    estado.garaje = $('f_garaje').value;
    estado.notas = $('f_notas').value;
    estado.obsAdic = $('f_observaciones_adicionales').value;
    estado.fechaFirma = $('f_fecha_firma').value;
    estado.cc1 = $('cc1').value;
    estado.cc2 = $('cc2').value;
  }

  /* ---------- Render del formulario ---------- */
  function render() {
    var cont = $('lista-items');
    cont.innerHTML = '';
    ZONAS.forEach(function (z, zi) {
      var zt = document.createElement('div');
      zt.className = 'zona-titulo';
      zt.textContent = z.nombre;
      cont.appendChild(zt);
      z.items.forEach(function (it, ii) { cont.appendChild(crearFila('it', zi + 'x' + ii, it)); });
    });
    var contL = $('lista-llaves');
    contL.innerHTML = '';
    LLAVES.forEach(function (it, ki) { contL.appendChild(crearFila('ll', ki, it)); });
    itemValores(estado);
    cargarVoz();
  }

  function crearFila(prefix, idx, descripcion) {
    var row = document.createElement('div');
    row.className = 'item';
    var c = function (f) { return prefix + '_' + idx + '_' + f; };
    var pk = function (f) { return prefix + '_' + idx + '_' + f; };
    row.innerHTML =
      '<div class="desc">' + esc(descripcion) + '</div>' +
      (prefix === 'll' ?
        '<div><input type="number" min="0" id="' + pk('cant') + '" placeholder="0" aria-label="Cantidad"></div>' :
        '<div><input type="number" min="0" id="' + pk('cant') + '" aria-label="Cantidad"></div>') +
      '<div><input type="text" id="' + pk('mat') + '" placeholder="---" aria-label="Tipo de material" style="' + (prefix === 'll' ? 'display:none;' : '') + '"></div>' +
      '<div class="estado-btns" id="' + pk('btns') + '" style="' + (prefix === 'll' ? 'display:none;' : '') + '">' +
        '<button type="button" class="est-btn" data-est="B">B</button>' +
        '<button type="button" class="est-btn" data-est="R">R</button>' +
        '<button type="button" class="est-btn" data-est="M">M</button>' +
      '</div>' +
      '<div class="obs-wrap">' +
        '<textarea id="' + pk('obs') + '" rows="1" aria-label="Observaciones"></textarea>' +
        '<button type="button" class="mic" data-field="' + pk('obs') + '" onclick="window.__invMic(\'' + pk('obs') + '\')" title="Dictar por voz">🎤</button>' +
      '</div>';
    return row;
  }

  function itemValores(s) {
    if (!s) return;
    var it = s.items || {};
    ZONAS.forEach(function (z, zi) {
      z.items.forEach(function (itm, ii) {
        var v = it[zi + 'x' + ii] || {};
        var p = 'it_' + zi + 'x' + ii + '_';
        if (v.cant != null) $(p + 'cant').value = v.cant;
        if (v.mat != null) $(p + 'mat').value = v.mat;
        if (v.obs != null) $(p + 'obs').value = v.obs;
        if (v.est) setEstUi(zi + 'x' + ii, v.est);
      });
    });
    var ll = s.llaves || {};
    LLAVES.forEach(function (itm, ki) {
      var v = ll[ki] || {};
      var p = 'll_' + ki + '_';
      if (v.cant != null) $(p + 'cant').value = v.cant;
      if (v.obs != null) $(p + 'obs').value = v.obs;
    });
  }

  function setEstUi(idx, est) {
    var cont = $('it_' + idx + '_btns');
    if (!cont || !est) return;
    var btn = cont.querySelector('[data-est="' + est + '"]');
    if (btn) btn.classList.add('activo-' + est);
  }

  window.__invSetEst = function (btnsId, est) {
    var cont = $(btnsId);
    if (!cont) return;
    var idx = btnsId.replace(/^it_/, '').replace('_btns', '');
    var yaActivo = cont.querySelector('[data-est="' + est + '"]').classList.contains('activo-' + est);
    cont.querySelectorAll('.est-btn').forEach(function (b) {
      b.classList.remove('activo-b', 'activo-r', 'activo-m');
    });
    if (!yaActivo && estado) {
      cont.querySelector('[data-est="' + est + '"]').classList.add('activo-' + est);
      estado.items = estado.items || {};
      estado.items[idx] = estado.items[idx] || {};
      estado.items[idx].est = est;
      programarAutosave();
    } else if (estado) {
      if (estado.items && estado.items[idx]) delete estado.items[idx].est;
      programarAutosave();
    }
  };

  /* ---------- Dictado por voz ---------- */
  function cargarVoz() {
    SB_WA = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
    if (!SB_WA) {
      document.querySelectorAll('.mic').forEach(function (b) {
        b.style.opacity = '0.4';
        b.title = 'Dictado no disponible (usa Chrome)';
      });
    }
  }

  window.__invMic = function (fieldId) {
    if (!SB_WA) { alert('Tu navegador no soporta dictado por voz. Usa Chrome (celular o computador).'); return; }
    if (sesionDict && sesionDict.activa) { detenerDictado(false); return; }
    sesionDict = {
      activa: true,
      fieldId: fieldId,
      base: leerValor(fieldId),
      finalAcum: '',
      ultIdx: -1,
      restartT: null
    };
    var micb = document.querySelector('[data-field="' + fieldId + '"]');
    if (micb) micb.classList.add('grabando');
    lanzarRecon();
  };

  function leerValor(fieldId) {
    var el = $(fieldId);
    return el ? el.value.trim() : '';
  }

  function lanzarRecon() {
    if (!sesionDict || !sesionDict.activa) return;
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    var rec = new SR();
    rec.lang = 'es-CO';
    rec.continuous = false;   // reconocimiento por tramos; se reinicia en onend
    rec.interimResults = true;

    rec.onresult = function (e) {
      if (!sesionDict || !sesionDict.activa) return;
      var interim = '';
      for (var i = e.resultIndex; i < e.results.length; i++) {
        var seg = (e.results[i][0].transcript || '').trim();
        if (e.results[i].isFinal) {
          if (i > sesionDict.ultIdx && seg) {
            sesionDict.ultIdx = i;
            sesionDict.finalAcum = agregarSegmento(sesionDict.finalAcum, seg);
          }
        } else {
          interim += seg;
        }
      }
      pintarDictado(interim);
      var el = $(sesionDict.fieldId);
      if (el) el.scrollTop = el.scrollHeight;
    };
    rec.onerror = function (e) {
      if (e.error === 'not-allowed') { detenerDictado(true); alert('Permiso de micrófono denegado. Actívalo en los ajustes del Chrome.'); }
      else if (e.error === 'language-not-supported') { detenerDictado(true); alert('El reconocimiento en español no está disponible en este dispositivo.'); }
      // no-speech / aborted / network: se reintenta en onend
    };
    rec.onend = function () {
      if (sesionDict && sesionDict.activa) {
        commitDictado();
        sesionDict.restartT = setTimeout(lanzarRecon, 250);
      }
    };
    try { rec.start(); } catch (e) { detenerDictado(true); }
  }

  function pintarDictado(interim) {
    if (!sesionDict) return;
    var partes = [];
    if (sesionDict.base) partes.push(sesionDict.base);
    if (sesionDict.finalAcum && sesionDict.finalAcum.trim()) partes.push(sesionDict.finalAcum.trim());
    var txt = partes.join(' ') + (interim ? ' ' + interim : '');
    var el = $(sesionDict.fieldId);
    if (el) el.value = txt;
  }

  function commitDictado() {
    if (!sesionDict) return;
    pintarDictado('');
    var el = $(sesionDict.fieldId);
    if (el) setterCampoObs(sesionDict.fieldId)(el.value.trim());
    programarAutosave();
  }

  function setterCampoObs(fieldId) {
    if (!estado) return function () {};
    if (fieldId.indexOf('ll_') === 0) {
      var ki = fieldId.replace(/^ll_/, '').replace('_obs', '');
      estado.llaves = estado.llaves || {};
      estado.llaves[ki] = estado.llaves[ki] || {};
      return function (v) { estado.llaves[ki].obs = v; };
    }
    var idx = fieldId.replace(/^it_/, '').replace('_obs', '');
    estado.items = estado.items || {};
    estado.items[idx] = estado.items[idx] || {};
    return function (v) { estado.items[idx].obs = v; };
  }

  function agregarSegmento(actual, seg) {
    var a = actual.trim(), s = (seg || '').trim();
    if (!s) return a;
    if (!a) return s;
    if (a === s) return a;
    if (a.indexOf(s) !== -1) return a;                                  // el tramo ya está contenido (motor repite el acumulado)
    if (s.indexOf(a) !== -1 && s.length - a.length <= 40) return s;     // crecimiento acumulativo pequeño
    return a + ' ' + s;
  }

  function detenerDictado(gra) {
    if (sesionDict) {
      sesionDict.activa = false;
      if (sesionDict.restartT) clearTimeout(sesionDict.restartT);
      commitDictado();
      var b = document.querySelector('[data-field="' + sesionDict.fieldId + '"]');
      if (b) b.classList.remove('grabando');
      sesionDict = null;
    }
  }

  /* ---------- Buscar / crear inmueble ---------- */
  window.buscarInmueble = function () {
    var nombre = $('input-nombre').value.trim();
    var st = $('status-carpeta');
    var err = $('estado-inmueble');
    if (!nombre) { err.style.display = 'block'; err.textContent = 'Ingresa el nombre del inmueble.'; return; }
    err.style.display = 'none';
    var btn = $('btn-buscar');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>Buscando...';

    if (!estaOnline()) {
      btn.disabled = false;
      btn.innerHTML = 'Buscar / Crear carpeta';
      if (!confirm('Sin internet. ¿Continuar y llenar igualmente? Se guardará localmente y podrás subirlo luego con señal.')) return;
      prepararForm(nombre, 'local_' + Date.now(), false);
      return;
    }

    obtenerCarpeta(nombre).then(function (r) {
      btn.disabled = false;
      btn.innerHTML = 'Buscar / Crear carpeta';
      if (r && r.success) {
        st.textContent = r.existente ? 'Carpeta existente: el inventario quedará junto a las fotos.' : 'Carpeta creada en Drive.';
        st.style.color = '#FFB01A';
        prepararForm(nombre, r.id, r.existente);
      } else {
        err.style.display = 'block';
        err.textContent = (r && r.error) ? 'Error: ' + r.error : 'Error al buscar el inmueble. Revisa tu conexión.';
      }
    });
  };

  function prepararForm(nombre, id) {
    detenerDictado(false);
    if (carpetaId && carpetaId !== id) guardarEstadoLocal();
    carpetaId = id;
    estado = cargarEstadoLocal() || nuevoEstado(nombre);
    estado.nombre = nombre;
    if (!estado.fecha) estado.fecha = hoyISO();

    $('seccion-inmueble').style.display = 'none';
    $('seccion-form').style.display = 'block';
    llenarCampos(estado);
    guardarEstadoLocal();
    vincularAutoguardado();
    window.scrollTo(0, 0);
  }

  function nuevoEstado(nombre) {
    return {
      nombre: nombre, fecha: hoyISO(), unidad: '', arrendador: '', arrendatario: '', direccion: '', garaje: '',
      notas: '', obsAdic: '', fechaFirma: '', cc1: '', cc2: '',
      items: {}, llaves: {}
    };
  }

  function llenarCampos(s) {
    $('f_fecha').value = s.fecha || '';
    $('f_unidad').value = s.unidad || '';
    $('f_arrendador').value = s.arrendador || '';
    $('f_arrendatario').value = s.arrendatario || '';
    $('f_direccion').value = s.direccion || '';
    $('f_garaje').value = s.garaje || '';
    $('f_notas').value = s.notas || '';
    $('f_observaciones_adicionales').value = s.obsAdic || '';
    $('f_fecha_firma').value = s.fechaFirma || '';
    $('cc1').value = s.cc1 || '';
    $('cc2').value = s.cc2 || '';
    itemValores(s);
  }

  function vincularAutoguardado() {
    ['f_fecha', 'f_unidad', 'f_arrendador', 'f_arrendatario', 'f_direccion', 'f_garaje', 'f_notas', 'f_observaciones_adicionales', 'f_fecha_firma', 'cc1', 'cc2'].forEach(function (id) {
      var el = $(id);
      if (el) el.addEventListener('input', function () { sincronizarDesdeForm(); programarAutosave(); });
    });
    document.querySelectorAll('#lista-items input, #lista-items textarea, #lista-llaves input, #lista-llaves textarea').forEach(function (el) {
      el.addEventListener('input', capturarCampo);
      el.addEventListener('blur', function () { sincronizarDesdeForm(); programarAutosave(); });
    });
    window.addEventListener('beforeunload', function () { sincronizarDesdeForm(); guardarEstadoLocal(); });
  }

  function capturarCampo() {
    var id = this.id;
    var esLl = id.indexOf('ll_') === 0;
    var resto = id.replace(/^(it|ll)_/, '');
    var campo = resto.slice(-4);
    var idx = resto.slice(0, -5);
    if (campo === '_mat') campo = 'mat';
    else if (campo === '_obs') campo = 'obs';
    else campo = 'cant';
    var cont = esLl ? (estado.llaves = estado.llaves || {}) : (estado.items = estado.items || {});
    cont[idx] = cont[idx] || {};
    cont[idx][campo] = this.value;
  }

  /* ---------- Firmas (canvas) ---------- */
  function configFirma(n) {
    var cv = $('firma' + n);
    var ctx = cv.getContext('2d');
    cv.width = 700; cv.height = 220;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
    var dibujando = false, ult = null;
    function pos(e) {
      var r = cv.getBoundingClientRect();
      return { x: (e.clientX - r.left) * (cv.width / r.width), y: (e.clientY - r.top) * (cv.height / r.height) };
    }
    cv.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      dibujando = true;
      try { cv.setPointerCapture(e.pointerId); } catch (err) {}
      var p = pos(e); ult = p;
      ctx.beginPath(); ctx.moveTo(p.x, p.y);
    });
    cv.addEventListener('pointermove', function (e) {
      if (!dibujando) return;
      var p = pos(e);
      ctx.lineWidth = 2.6; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#111';
      ctx.lineTo(p.x, p.y); ctx.stroke();
      ult = p;
    });
    cv.addEventListener('pointerup', function () { dibujando = false; });
    cv.addEventListener('pointerleave', function () { dibujando = false; });
  }

  window.limpiarFirma = function (n) {
    var cv = $('firma' + n);
    var ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
  };

  function firmaTieneContenido(n) {
    try {
      var cv = $('firma' + n);
      var ctx = cv.getContext('2d');
      var d = ctx.getImageData(0, 0, cv.width, cv.height).data;
      for (var i = 0; i < d.length; i += 4) { if (d[i + 3] > 0 && d[i] < 160) return true; }
    } catch (e) {}
    return false;
  }

  function firmaDataUrl(n) {
    return firmaTieneContenido(n) ? $('firma' + n).toDataURL('image/jpeg', 0.85) : null;
  }

  /* ============================================================
     PDF fiel al formulario original
     ============================================================ */
  function construirDoc(stt) {
    if (stt) estado = stt;
    var doc = new window.jspdf.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
    var M = 10, W = 215.9 - 2 * M;
    var COLS = { desc: 55, cant: 10, mat: 28, b: 7, r: 7, m: 7, obs: 81.9 };
    var Y = M;

    function nuevaLinea() { Y = M; doc.addPage(); }
    function available() { return 279.4 - 15 - Y; }
    function asegurarEspacio(h) {
      if (h > available()) { nuevaLinea(); dibujarEncabezado(); }
    }
    function txt(x, y, s, fs) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(fs || 7.5);
      doc.text(s, x, y);
    }

    function dibujarEncabezado() {
      var c = COLS; var x = M; var h = 7;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setFillColor(240, 240, 240);
      doc.rect(x, Y, c.desc, h, 'F'); doc.text('DESCRIPCION', x + 2, Y + 4.5); x += c.desc;
      doc.rect(x, Y, c.cant, h, 'F'); doc.text('CANT', x + 2, Y + 4.5); x += c.cant;
      doc.rect(x, Y, c.mat, h, 'F'); doc.text('TIPO DE MATERIAL', x + 2, Y + 4.5); x += c.mat;
      doc.rect(x, Y, c.b, h, 'F'); doc.text('B', x + 2.2, Y + 4.5); x += c.b;
      doc.rect(x, Y, c.r, h, 'F'); doc.text('R', x + 2.2, Y + 4.5); x += c.r;
      doc.rect(x, Y, c.m, h, 'F'); doc.text('M', x + 2.2, Y + 4.5); x += c.m;
      doc.rect(x, Y, c.obs, h, 'F'); doc.text('OBSERVACIONES', x + 2, Y + 4.5);
      doc.setLineWidth(0.2); doc.rect(M, Y, W, h);
      Y += h;
    }

    function filaZona(nombre) {
      var h = 6.5;
      asegurarEspacio(h);
      doc.setFillColor(224, 224, 224);
      doc.rect(M, Y, W, h, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
      doc.text(nombre, M + 2, Y + 4.4);
      Y += h;
    }

    function filaItems(desc, cant, mat, est, obs) {
      doc.setFontSize(7.5);
      var lDesc = doc.splitTextToSize(desc, COLS.desc - 4);
      var lMat = doc.splitTextToSize(mat, COLS.mat - 4);
      var lObs = doc.splitTextToSize(obs, COLS.obs - 4);
      var h = Math.max(lDesc.length, lMat.length, lObs.length, 1) * 3.4 + 2.4;
      h = Math.max(h, 6);
      asegurarEspacio(h);
      var x = M;
      doc.setFillColor(255, 255, 255); doc.setDrawColor(0); doc.setLineWidth(0.2);
      doc.rect(x, Y, COLS.desc, h); txt(x + 2, Y + 3.2, lDesc, 7.5); x += COLS.desc;
      doc.rect(x, Y, COLS.cant, h); doc.setFontSize(8); doc.text(cant, x + 2, Y + 4.2); x += COLS.cant;
      doc.rect(x, Y, COLS.mat, h); txt(x + 1.5, Y + 3.2, lMat, 7.5); x += COLS.mat;
      doc.rect(x, Y, COLS.b, h); if (est === 'B') { doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.text('X', x + 3.5, Y + 4.4, { align: 'center' }); } x += COLS.b;
      doc.rect(x, Y, COLS.r, h); if (est === 'R') { doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.text('X', x + 3.5, Y + 4.4, { align: 'center' }); } x += COLS.r;
      doc.rect(x, Y, COLS.m, h); if (est === 'M') { doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.text('X', x + 3.5, Y + 4.4, { align: 'center' }); } x += COLS.m;
      doc.rect(x, Y, COLS.obs, h); txt(x + 1.5, Y + 3.2, lObs, 7.5);
      Y += h;
    }

    /* Página 1: título + datos */
    doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
    doc.text('INVENTARIO APARTAMENTO', W / 2 + M, Y + 5, { align: 'center' });
    Y += 12;
    var datosD = [['FECHA:', fmtFecha(estado.fecha)], ['ARRENDADOR:', estado.arrendador], ['ARRENDATARIO:', estado.arrendatario], ['DIRECCION:', estado.direccion], ['UNIDAD:', estado.unidad]];
    datosD.forEach(function (d) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
      doc.text(d[0], M, Y + 3);
      var lx = M + 42, lw = W - 42;
      doc.setFont('helvetica', 'normal');
      if (d[1]) doc.text(String(d[1]), lx + 1, Y + 3);
      doc.setLineWidth(0.2); doc.line(lx, Y + 4, lx + lw, Y + 4);
      Y += 8;
    });
    Y += 4;

    var items = estado.items || {};
    dibujarEncabezado();
    ZONAS.forEach(function (z, zi) {
      filaZona(z.nombre);
      z.items.forEach(function (itm, ii) {
        var v = items[zi + 'x' + ii] || {};
        filaItems(itm, v.cant != null ? String(v.cant) : '', texto(v.mat), (v.est || ''), texto(v.obs));
      });
    });

    /* Página final */
    nuevaLinea();
    var legal = 'Declaramos expresamente las partes, que el inmueble ha sido entregado a la persona delegada por los arrendatarios a recibir, conforme al presente inventario. Acorde con el contrato de arrendamiento, los arrendatarios se comprometen a conservar y mantener el inmueble y su correspondiente dotación, en el mismo estado en que lo reciben, salvo los deterioros naturales originados en el uso decente del mismo, así como arreglar daños resultantes del maltrato o descuido en el lapso de la tenencia. Si estos arreglos no se hicieron queda el arrendador autorizado para hacerlos por su cuenta y para cobrar ejecutivamente las correspondientes; para ese efecto convienen las partes en que las facturas de reparación de daños o de reposición de faltantes junto con el contrato de arrendamiento prestaran merito ejecutivo suficiente, para constancia de nuestra conformidad firmamos el presente documento a los ______ días del mes de ______________ del año __________';
    Y += 2;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
    doc.splitTextToSize(legal, W).forEach(function (l) {
      if (l === '') return;
      if (Y > 279.4 - 18) nuevaLinea();
      doc.text(l, M, Y + 3); Y += 4;
    });
    Y += 5;

    /* Firmas */
    var sgnH = 26, wF = (W - 10) / 2;
    [1, 2].forEach(function (n) {
      var bx = M + (n - 1) * (wF + 10);
      var rol = n === 1 ? 'QUIEN RECIBE EN REPRESENTACION DE LOS ARRENDATARIOS' : 'QUIEN ENTREGA EN REPRESENTACION DE LA INMOBILIARIA';
      if (Y + 42 > 279.4 - 12) nuevaLinea();
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5);
      Y += 4; doc.text(rol, bx + 1, Y); Y += 3;
      doc.rect(bx, Y, wF, sgnH);
      var fUrl = firmaDataUrl(n);
      if (fUrl) doc.addImage(fUrl, 'JPEG', bx + 5, Y + 3, wF - 10, sgnH - 6, undefined, 'FAST');
      Y += sgnH;
      var cc = n === 1 ? estado.cc1 : estado.cc2;
      doc.setFont('helvetica', 'bold'); doc.text('c.c', bx + 1, Y + 3);
      doc.setFont('helvetica', 'normal');
      if (texto(cc)) doc.text(texto(cc), bx + 8, Y + 3);
      doc.setLineWidth(0.2); doc.line(bx + 7, Y + 4.5, bx + wF, Y + 4.5);
      Y += 10;
    });
    Y += 5;

    /* Observaciones adicionales */
    if (Y + 26 > 279.4 - 12) nuevaLinea();
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
    doc.text('OBSERVACIONES ADICIONALES:', M, Y + 3); Y += 5;
    doc.rect(M, Y, W, 22);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
    doc.splitTextToSize(texto(estado.obsAdic), W - 4).forEach(function (l) {
      if (l === '') return;
      if (Y + 4 > 279.4 - 12) { nuevaLinea(); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); }
      doc.text(l, M + 2, Y + 3); Y += 4;
    });
    Y += 26;

    /* Inventario de llaves */
    if (Y + 8 > 279.4 - 12) nuevaLinea();
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
    doc.text('INVENTARIO LLAVES', M, Y + 4); Y += 7;

    var kCols = { desc: 70, cant: 18, obs: W - 88 };
    function encabezadoLlaves() {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setFillColor(240, 240, 240);
      doc.rect(M, Y, kCols.desc, 6, 'F'); doc.text('DESCRIPCION', M + 2, Y + 4);
      doc.rect(M + kCols.desc, Y, kCols.cant, 6, 'F'); doc.text('CANTIDAD', M + kCols.desc + 2, Y + 4);
      doc.rect(M + kCols.desc + kCols.cant, Y, kCols.obs, 6, 'F'); doc.text('OBSERVACIONES', M + kCols.desc + kCols.cant + 2, Y + 4);
      doc.setLineWidth(0.2); doc.rect(M, Y, W, 6);
      Y += 6;
    }
    encabezadoLlaves();
    var llaves = estado.llaves || {};
    LLAVES.forEach(function (itm, ki) {
      var v = llaves[ki] || {};
      var lObs = doc.splitTextToSize(texto(v.obs), kCols.obs - 4);
      var h = Math.max(lObs.length * 3.4 + 2.4, 6);
      if (h > available()) { nuevaLinea(); encabezadoLlaves(); }
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
      doc.rect(M, Y, kCols.desc, h); doc.text(itm, M + 2, Y + 3.2);
      doc.rect(M + kCols.desc, Y, kCols.cant, h); doc.text(v.cant != null ? String(v.cant) : '', M + kCols.desc + 2, Y + 3.2);
      doc.rect(M + kCols.desc + kCols.cant, Y, kCols.obs, h); doc.text(lObs, M + kCols.desc + kCols.cant + 2, Y + 3.2);
      Y += h;
    });

    /* Números de página */
    var tot = doc.internal.getNumberOfPages();
    for (var pg = 1; pg <= tot; pg++) {
      doc.setPage(pg);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
      doc.text('Página ' + pg + ' de ' + tot, W / 2 + M, 277, { align: 'center' });
    }
    return doc;
  }

  function nombrePdf() {
    return 'INVENTARIO_' + (limpio(estado.nombre) || 'apartamento') + '_' + (fmtFecha(estado.fecha).replace(/\//g, '-') || 'sinfecha') + '.pdf';
  }

  window.generarPDF = function (abrir) {
    if (!window.jspdf || !window.jspdf.jsPDF) { alert('Falta la librería de PDF (jspdf).'); return; }
    sincronizarDesdeForm();
    var doc = construirDoc();
    if (abrir) {
      window.open(doc.output('bloburl'), '_blank');
    } else {
      doc.save(nombrePdf());
    }
    mostrarEstadoForm('PDF generado correctamente.', 'exito');
  };

  /* ---------- Guardar en Drive ---------- */
  window.guardarEnDrive = function () {
    sincronizarDesdeForm();
    if (!estado || !texto(estado.nombre)) { alert('Falta el nombre del inmueble.'); return; }
    if (!window.jspdf || !window.jspdf.jsPDF) { alert('Falta la librería de PDF.'); return; }
    if (!estaOnline()) {
      alert('Sin internet. El inventario quedó guardado localmente.\nCon señal, vuelve a abrir esta página y pulsa "Guardar en Drive".');
      programarAutosave();
      return;
    }

    var btn = $('btn-guardar');
    btn.disabled = true;

    var enviar = function (id) {
      btn.innerHTML = '<span class="spinner"></span>Generando PDF...';
      var doc = construirDoc();
      btn.innerHTML = '<span class="spinner"></span>Subiendo a Drive...';
      subirPdfBlob(id, doc.output('blob'));
    };

    if (!carpetaId || carpetaId.indexOf('local_') === 0) {
      obtenerCarpeta(estado.nombre).then(function (r) {
        if (r && r.success) {
          carpetaId = r.id;
          if (localStorage.getItem(claveLocal()) && cargarEstadoLocal()) guardarEstadoLocal();
          enviar(r.id);
        } else {
          btn.disabled = false; btn.innerHTML = 'Guardar en Drive';
          mostrarEstadoForm('No se pudo crear/encontrar la carpeta en Drive.', 'error');
        }
      });
    } else {
      enviar(carpetaId);
    }
  };

  function subirPdfBlob(id, blob) {
    var reader = new FileReader();
    reader.onload = function () {
      var base64 = String(reader.result).split(',')[1];
      var iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.name = 'upload-inv-' + Date.now();
      document.body.appendChild(iframe);

      var form = document.createElement('form');
      form.method = 'POST';
      form.action = API_URL;
      form.target = iframe.name;
      form.enctype = 'application/x-www-form-urlencoded';

      var inp = document.createElement('input');
      inp.type = 'hidden';
      inp.name = 'data';
      inp.value = JSON.stringify({ action: 'guardarInventario', carpetaId: id, base64: base64, nombre: nombrePdf() });
      form.appendChild(inp);
      document.body.appendChild(form);

      iframe.onload = function () {
        setTimeout(function () {
          iframe.remove();
          form.remove();
          var btn = $('btn-guardar');
          btn.disabled = false;
          btn.innerHTML = 'Guardar en Drive';
          mostrarEstadoForm('Inventario subido a Drive en la carpeta de ' + estado.nombre + '.', 'exito');
        }, 400);
      };
      form.submit();
    };
    reader.readAsDataURL(blob);
  }

  /* ---------- UI / estado ---------- */
  function mostrarEstadoForm(msg, tipo) {
    var e = $('estado-form');
    e.style.display = 'block';
    e.className = 'estado estado-' + tipo;
    e.textContent = msg;
  }

  window.nuevoFormulario = function () {
    if (!confirm('¿Empezar un formulario nuevo? Se borrará lo llenado en este dispositivo.')) return;
    detenerDictado(false);
    borrarEstadoLocal();
    estado = null;
    carpetaId = '';
    location.reload();
  };

  /* ---------- Inicio ---------- */
  function init() {
    render();
    // Delegación: botones B/R/M (evita onclicks inline frágiles en móviles)
    var listaItems = $('lista-items');
    if (listaItems) {
      listaItems.addEventListener('click', function (e) {
        var btn = e.target && e.target.closest ? e.target.closest('.est-btn') : null;
        if (!btn) return;
        var cont = btn.parentElement;
        if (cont && cont.id) window.__invSetEst(cont.id, btn.getAttribute('data-est'));
      });
    }
    configFirma(1);
    configFirma(2);
    var nombrePrev = null;
    try { nombrePrev = localStorage.getItem('inv_nombre_fotos') || new URLSearchParams(location.search).get('inmueble'); } catch (e) {}
    if (nombrePrev) $('input-nombre').value = nombrePrev;
    if (nombrePrev && navigator.onLine) $('btn-buscar').click();
  }

  document.addEventListener('DOMContentLoaded', init);

  /* Hook de prueba (herramienta interna) */
  window.__invTest = { construirDoc: construirDoc, ZONAS: ZONAS, LLAVES: LLAVES, nuevoEstado: nuevoEstado };
})();