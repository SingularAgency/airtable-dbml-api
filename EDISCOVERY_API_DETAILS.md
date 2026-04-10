# Airtable eDiscovery API - Detalles para Enterprise Scale

## Resumen Ejecutivo

La API de eDiscovery de Airtable está disponible **exclusivamente para clientes con plan Enterprise Scale**. Sin embargo, **NO proporciona información sobre dependencias de campos** (interfaces, automatizaciones, webhooks, etc.).

## ¿Qué es la API de eDiscovery?

La API de eDiscovery está diseñada para **exportar datos de registros** de bases de Airtable para:
- Revisiones legales
- Cumplimiento normativo
- Auditorías de seguridad
- Preservación de datos en sistemas externos

## ¿Qué información SÍ incluye?

### Datos Exportados
- ✅ **Datos de las tablas**: Todos los valores de campos almacenados en los registros
- ✅ **Comentarios activos**: Comentarios que están actualmente en los registros
- ✅ **Metadatos básicos**:
  - Fecha de creación del registro
  - ID del usuario que creó el registro
  - Fecha de última modificación
  - ID del usuario que modificó el registro

### Formatos Disponibles
- **JSON**: Incluye detalles de registros, metadatos y comentarios
- **CSV**: Estructura tabular de datos de tablas y comentarios

## ¿Qué información NO incluye?

### Limitaciones Confirmadas
La documentación oficial de Airtable especifica que la API de eDiscovery **NO incluye**:

- ❌ **Valores de columnas calculadas**: Fórmulas, rollups, lookups
- ❌ **Información sobre diseño de interfaces**: Configuración, campos usados, etc.
- ❌ **Detalles de configuración de automatizaciones**: Triggers, actions, campos referenciados
- ❌ **Uso de extensiones**: Apps o scripts personalizados
- ❌ **Historial de revisiones**: Cambios históricos en registros
- ❌ **Registros eliminados**: Información sobre registros que fueron borrados

## Proceso de Uso

### 1. Identificar el ID de la Base
- El ID de la base tiene formato `appxxxxxxxx`
- Se puede encontrar en el panel de administración de Airtable, sección "Bases"

### 2. Solicitar Exportación
**Endpoint:** `POST /v0/enterprise/ediscovery/exports`

**Parámetros:**
- `baseId`: ID de la base a exportar
- `format`: "json" o "csv"
- `emailNotification`: (opcional) Recibir notificación por email cuando complete

**Respuesta:**
- `enterpriseTaskId`: ID de la tarea de exportación

### 3. Verificar Estado
**Endpoint:** `GET /v0/enterprise/ediscovery/exports/{enterpriseTaskId}`

**Estados posibles:**
- `Pending`: La tarea está en cola
- `Processing`: La tarea está en proceso
- `Error`: Hubo un error (reintentar o contactar soporte)
- `Done`: Exportación completada (incluye enlaces de descarga)

## Requisitos de Acceso

### Permisos Necesarios
- ✅ Ser **administrador de la organización**
- ✅ Tener un **Token de Acceso Personal (PAT)** con permisos adecuados
- ✅ Tener plan **Enterprise Scale**

### Autenticación
- Usar el PAT en el header: `Authorization: Bearer {PAT}`
- El PAT debe tener permisos de eDiscovery habilitados

## Conclusión sobre Dependencias de Campos

### ❌ NO es útil para dependencias de campos

La API de eDiscovery está diseñada para exportar **datos de registros**, no para obtener **metadatos sobre la estructura y uso de la base**. Por lo tanto:

- **NO puede identificar** qué campos se usan en interfaces
- **NO puede identificar** qué campos se usan en automatizaciones
- **NO puede identificar** qué campos se usan en webhooks
- **NO puede identificar** qué campos se usan en apps/scripts

### Alternativas para Dependencias

Dado que ninguna API de Airtable proporciona esta información, las únicas alternativas son:

1. **Revisión manual** en la interfaz de Airtable:
   - Revisar cada interface manualmente
   - Revisar cada automation manualmente
   - Revisar cada webhook manualmente

2. **Herramientas de terceros** (si existen):
   - Explorar herramientas que puedan analizar la interfaz de Airtable
   - Considerar scripts personalizados que interactúen con la UI (no recomendado)

3. **Contactar a Airtable**:
   - Solicitar esta funcionalidad como feature request
   - Verificar si hay planes futuros para incluir esta información

## Referencias

- [Documentación oficial de eDiscovery API](https://support.airtable.com/docs/ediscovery-apis-in-airtable)
- [Airtable Enterprise Scale](https://airtable.com/enterprise)

---

**Última actualización:** Enero 2025
**Estado:** Confirmado - eDiscovery API NO incluye información sobre dependencias de campos
