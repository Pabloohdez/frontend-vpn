# Capturas del panel

> Coloca aquí capturas reales **anonimizadas** del panel para mostrar la web en
> el README de GitHub. Estas imágenes son las que la gente verá al llegar al
> repositorio, así que merecen cariño.

## Buenas prácticas

- Resolución mínima recomendada: **1280×720** (mejor 1440×900 si tu pantalla es Retina).
- Tamaño máx. por imagen: **400 KB** (usa `pngquant` o `oxipng` para optimizar).
- Formato: PNG para UI, GIF/MP4 corto (≤ 8 s, < 2 MB) para demos.
- Modo claro y oscuro: añade ambas si tienes tema oscuro implementado.
- **Sin datos reales**: tapa o sustituye IPs, MACs, nombres de equipo, dominios
  internos y correos antes de subir. Sugerencia: pasa por un editor y reemplaza
  con `device-01.local`, `192.0.2.x`, `usuario-demo`, etc.

## Archivos esperados

Si guardas las imágenes con estos nombres, el README las carga automáticamente:

| Archivo | Vista |
|---------|-------|
| `01-home.png` | Pantalla de inicio |
| `02-dns.png` | Consultas DNS en vivo con filtros |
| `03-pihole-lists.png` | Listas Pi-hole |
| `04-pihole-blocks.png` | Cortar/restaurar internet por IP |
| `05-users.png` | Gestión de usuarios OpenVPN |
| `06-audit.png` | Auditoría |
| `07-security.png` | Dashboard de seguridad |
| `08-pdf-report.png` | Vista previa del informe PDF |
| `demo.gif` | (Opcional) GIF de 5-8 s mostrando un flujo |

## Cómo capturar en Linux/macOS sin filtrar datos

```bash
# Linux GNOME: Win+Shift+S o gnome-screenshot
gnome-screenshot -a -f docs/screenshots/01-home.png

# macOS: Cmd+Shift+4
# Luego abre la imagen en Vista Previa, anota / tacha datos sensibles y guarda.

# Optimizar PNG (instala con: sudo apt install pngquant)
pngquant --force --quality=70-90 --output docs/screenshots/01-home.png docs/screenshots/01-home.png
```
