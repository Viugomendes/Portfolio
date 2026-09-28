
---
aliases: []
tags:
  - maquina:
  - htb:
  - os:
  - dificultad:
plataforma: 
fecha_resolucion: {{date:YYYY-MM-DD}}
tecnicas_clave:
cve:
vector_inicial: 
escalada_privilegios: 
autor: 
writeup_url: 

---
### Explicación de las propiedades

#### Metadatos básicos

- **`tags`**: Te permite filtrar rápidamente en Obsidian usando el buscador o plugins como **Dataview**. Puedes organizarlos por plataforma (`#htb`), sistema operativo (`#os/windows`), o dificultad (`#dificultad/media`).
- **`plataforma`**: Indica la procedencia (_HackTheBox, VulnHub, TryHackMe, VulnLab, Proving).
- **`dificultad`**: Categorización oficial o percibida (_Easy, Medium, Hard, Insane_).
- **`fecha_resolucion`**: Si usas el plugin nativo **Templates** (o **Templater**), `{{date:YYYY-MM-DD}}` insertará la fecha automáticamente al crear la nota.
#### Análisis técnico y taxonomía

- **`tecnicas_clave`**: Lista de técnicas o conceptos trabajados (ej. `SQLi`, `LFI`, `Active Directory`, `SUDO misconfiguration`, `Buffer Overflow`).
- **`vector_inicial`**: Una frase corta que resuma cómo conseguiste la primera shell (ej. _RCE vía upload de archivo filtrado en formulario de contacto_).
- **`escalada_privilegios`**: Una frase corta que resuma cómo pasaste a `root` / `SYSTEM` (ej. _Abuso de binario SUID en /usr/bin/python3_).
#### Referencias

- **`autor`**: Creador de la máquina (útil para seguir a creadores específicos).
- **`writeup_url`**: Enlace a un writeup de referencia oficial o de la comunidad por si necesitas consultar algo en el futuro.
### Ejemplo de uso con Dataview

Si utilizas el plugin **Dataview** en Obsidian, este header te permitirá generar tablas automáticas de tus máquinas resueltas. Por ejemplo, creando una nota llamada `Resumen de Máquinas` con este código:
````
```dataview
TABLE plataforma, sistema_operativo AS "OS", dificultad AS "Dificultad", vector_inicial AS "Vector Inicial"
FROM #maquina
WHERE estado = "Terminado"
SORT fecha_resolucion DESC
```
````