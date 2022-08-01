
# Configure Access to a Private Repository

There are two approaches to using a private repo 
 * Using Github private repo
 * Using GCP's Cloud Repository

It all depends on how your team is using the repo and communicating.  If the team is using Github private repo, then follow approach #1.  If your team is using GCP Cloud Repository and it can be shared with all people involved, then follow approach #2

## 1 - Github Private Repo

If github is the preferred repository, do the following for the startup scripts to access the private repo.  Both involve using GCP Secret Manager.

### 1a - Store username and personal access token

https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token

https://github.com/settings/tokens

Add role to service account to access cloud secret manager
Role: Secret Manager Secret Accessor
Service account: @cloudbuild.gserviceaccount.com 

Add secrets to the secret manager for github (https://cloud.google.com/secret-manager/docs/create-secret)

Note that this should the github username, not email address
GITHUB_USERNAME=xxxx
GITHUB_KEY=xxxx

```
echo -n "$GITHUB_USERNAME" | gcloud secrets create github-username \
    --replication-policy="automatic" \
    --data-file=-
```
Note that this should be the personal access token, not the password
```
echo -n "$GITHUB_KEY" | gcloud secrets create github-key \
    --replication-policy="automatic" \
    --data-file=-
```

#### Update startup script to the following:

Update the startup scripts to clone from git using the new authentication


Old:
```
# Install program
echo "Cloning repo"
git clone https://github.com/fayezinislam/websocket-to-pubsub-ingest.git
cd websocket-to-pubsub-ingest
```

New: 
```
# Get Github Login 
GITHUB_USERNAME=$(gcloud secrets versions access 1 --secret="github-username")
GITHUB_KEY=$(gcloud secrets versions access 1 --secret="github-key")

# Install program
echo "Cloning repo"
git clone https://$GITHUB_USERNAME:$GITHUB_KEY@github.com/fayezinislam/websocket-to-pubsub-ingest.git
cd websocket-to-pubsub-ingest

# Remove values
GITHUB_USERNAME=
GITHUB_KEY=
```

### 1b - Set ssh key

Reference: https://cloud.google.com/build/docs/access-github-from-build

Create an ssh key

```
GITHUB_EMAIL=xxx@email.com
ssh-keygen -t rsa -b 4096 -N '' -f id_github -C $GITHUB_EMAIL
```

Update contents of private key into cloud secrets
```
gcloud secrets create github-pk \
    --replication-policy="automatic" \
    --data-file=./id_github
```

In github, add the public ssh key into your profile settings --> [SSH and GPG Keys] (https://github.com/settings/keys)

Click the "New SSH Key" green button.  Copy contents of ./id_github.pub

cat ./id_github.pub


#### Update startup script

Update the startup scripts to clone from git using the new authentication


Old:
```
# Install program
echo "Cloning repo"
git clone https://github.com/fayezinislam/websocket-to-pubsub-ingest.git
cd websocket-to-pubsub-ingest
```

New:
```
echo "Set SSH key"

## Get github ssh pub key
ssh-keyscan -t rsa github.com > known_hosts.github

## Get github private key into secret
GITHUB_PK=$(gcloud secrets versions access 1 --secret="github-pk")
echo "$GITHUB_PK"  >> /root/.ssh/id_rsa
chmod 400 /root/.ssh/id_rsa
cp known_hosts.github /root/.ssh/known_hosts

echo "Cloning repo"
git@github.com:fayezinislam/websocket-to-pubsub-ingest.git
cd websocket-to-pubsub-ingest
```

## 2 - GCP Cloud Repository


Create a [Cloud Repository](https://cloud.google.com/source-repositories/docs/create-code-repository)

```
REPO_NAME=xxxx

gcloud source repos create $REPO_NAME
```

### 2a - Push new code to Repo

Push the code to Cloud Repository
```
gcloud source repos clone $REPO_NAME
git add .
git commit -m "message"
git push origin master
```

### 2b - Mirror Github Repo

Mirror an existing [github repo] (https://cloud.google.com/source-repositories/docs/create-code-repository)


#### Update the Startup Script


Update the startup scripts to clone from git using the new authentication

Old:
```
# Install program
echo "Cloning repo"
git clone https://github.com/fayezinislam/websocket-to-pubsub-ingest.git
cd websocket-to-pubsub-ingest
```

New:
```
REPO_NAME=xxxx
PROJECT_NAME=xxxx

gcloud source repos clone $REPO_NAME --project=$PROJECT_NAME
cd websocket-to-pubsub-ingest
```


