# Airtable API Research - Views and Field Dependencies

## 1. Información de Vistas en el JSON Exportado

### Datos Disponibles en el JSON Exportado
Según el análisis del archivo JSON exportado de Airtable, las vistas solo contienen **3 campos**:

```json
{
  "views": [
    {
      "id": "viwT9kBA1fh7xue4b",
      "name": "1. In Progress ",
      "type": "grid"
    }
  ]
}
```

**Campos disponibles:**
- `id`: Identificador único de la vista (ej: "viwT9kBA1fh7xue4b")
- `name`: Nombre de la vista (ej: "1. In Progress ")
- `type`: Tipo de vista (ej: "grid", "kanban", "form", "calendar", "gallery")

### Datos NO Disponibles en el JSON Exportado
- ❌ `filters`: Criterios de filtrado
- ❌ `groups`: Configuración de agrupación
- ❌ `sorts`: Configuración de ordenación
- ❌ `visibleFieldIds`: IDs de campos visibles
- ❌ `description`: Descripción de la vista
- ❌ `personal` / `collaborative` / `locked`: Tipo de acceso a la vista

---

## 2. Información de Vistas en la Metadata API

### Endpoint de Metadata API
```
GET /v0/meta/bases/{baseId}/tables/{tableId}/views
```

### Datos Disponibles en la Metadata API
Según la documentación oficial y la implementación actual, la Metadata API puede proporcionar información adicional:

**Campos confirmados:**
- ✅ `id`: Identificador único de la vista
- ✅ `name`: Nombre de la vista
- ✅ `type`: Tipo de vista (grid, kanban, form, calendar, gallery)

**Campos que podrían estar disponibles (requiere verificación):**
- ⚠️ `visibleFieldIds`: Array de IDs de campos visibles en la vista
- ⚠️ `description`: Descripción de la vista (si existe)

**Campos NO disponibles en la Metadata API:**
- ❌ `filters`: Criterios de filtrado detallados
- ❌ `groups`: Configuración de agrupación
- ❌ `sorts`: Configuración de ordenación
- ❌ `personal` / `collaborative` / `locked`: Tipo de acceso a la vista

### Nota Importante
La Metadata API es diferente de la API estándar y puede proporcionar más información que el JSON exportado, pero aún tiene limitaciones significativas. Se recomienda probar el endpoint directamente para confirmar qué campos exactos están disponibles.

---

## 3. Dependencias de Campos (Interfaces, Automatizaciones, etc.)

### Investigación sobre Dependencias de Campos

**Pregunta:** ¿Es posible saber si un campo es usado por una interface, automation, webhook, etc.?

### Respuesta: NO disponible en la API estándar

La API pública de Airtable **NO proporciona** endpoints para obtener información sobre dependencias de campos, incluyendo:

- ❌ **Interfaces**: No hay forma de saber qué campos se usan en interfaces
- ❌ **Automatizaciones**: No hay forma de saber qué campos se usan en automatizaciones
- ❌ **Webhooks**: No hay forma de saber qué campos se usan en webhooks
- ❌ **Apps/Scripts**: No hay forma de saber qué campos se usan en apps o scripts personalizados
- ❌ **Vistas**: Solo podemos saber qué campos son visibles en una vista (si la Metadata API lo proporciona)

### Alternativas Disponibles

#### 1. API de eDiscovery (Enterprise Scale) ⚠️ NO INCLUYE DEPENDENCIAS

Airtable ofrece una API de eDiscovery para clientes con plan **Enterprise Scale**, que permite:
- Exportar datos de bases en formatos CSV y JSON
- Incluir metadatos sobre registros (fechas de creación/modificación, usuarios, etc.)
- Exportar comentarios activos en registros

**⚠️ IMPORTANTE - Limitaciones Confirmadas:**
Según la documentación oficial de Airtable, la API de eDiscovery **NO incluye**:
- ❌ **Información sobre la configuración de interfaces**
- ❌ **Detalles de configuración de automatizaciones**
- ❌ **Uso de extensiones**
- ❌ **Valores de columnas calculadas** (fórmulas, rollups)
- ❌ **Historial de revisiones de registros**
- ❌ **Información sobre registros eliminados**

**Lo que SÍ incluye:**
- ✅ Datos de las tablas (valores de campos)
- ✅ Comentarios activos en registros
- ✅ Metadatos básicos (fechas de creación/modificación, usuarios)

**Conclusión:** La API de eDiscovery está diseñada para exportar **datos de registros**, no para obtener metadatos sobre **dependencias de campos** o **configuración de interfaces/automatizaciones**. Por lo tanto, **NO es útil** para identificar qué campos son usados por interfaces, automatizaciones, etc.

**Requisitos:**
- Requiere plan Enterprise Scale
- Requiere permisos de administrador
- Requiere Token de Acceso Personal (PAT) con permisos adecuados

#### 2. Análisis Manual
La única forma actual de identificar dependencias de campos es:
- Revisar manualmente cada interface en Airtable
- Revisar manualmente cada automation
- Revisar manualmente cada webhook
- Revisar manualmente cada script/app

---

## 4. Recomendaciones

### Para el Reporte de Vistas
1. **Usar Metadata API**: La Metadata API puede proporcionar `visibleFieldIds` y posiblemente `description`, que no están en el JSON exportado.
2. **Documentar limitaciones**: Es importante documentar claramente que filters, groups, sorts y view access type no están disponibles.
3. **Verificar respuesta real**: Se recomienda hacer una prueba real con la Metadata API para confirmar exactamente qué campos devuelve.

### Para Dependencias de Campos
1. **No implementar**: No es posible obtener esta información a través de ninguna API de Airtable (ni pública ni eDiscovery).
2. **API de eDiscovery NO es útil**: Aunque el cliente tenga plan Enterprise Scale, la API de eDiscovery no incluye información sobre dependencias de campos, interfaces o automatizaciones.
3. **Documentar limitación**: Informar al usuario que esta funcionalidad no está disponible actualmente en ninguna API de Airtable.
4. **Única alternativa**: Revisión manual de interfaces, automatizaciones y webhooks en la interfaz de Airtable.

---

## 5. Referencias

- [Airtable API Documentation](https://airtable.com/api)
- [Airtable Metadata API](https://airtable.com/api/meta)
- [Airtable eDiscovery APIs](https://support.airtable.com/docs/es/ediscovery-apis-in-airtable)

---

**Última actualización:** Basado en investigación realizada en enero 2025
