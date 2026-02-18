# Turbotic Playground - Quick Start Guide

A comprehensive Helm chart for deploying the complete Turbotic Playground platform on Kubernetes.

## 🚀 What's Included

This chart deploys the core components:

- **App**: Main Next.js application (port 3000) - Web UI and API
- **Realtime Server**: WebSocket server for real-time updates (port 3001)
- **Worker Node**: Background job processor - Handles scheduled automations and queue processing

## Prerequisites Checklist

- [ ] Kubernetes cluster (1.19+)
- [ ] Helm 3.0+ installed
- [ ] kubectl configured
- [ ] Docker installed and configured
- [ ] MongoDB instance (external - provide connection string)
- [ ] RabbitMQ instance (external - provide connection string)
- [ ] Docker images built and available in your registry

## 0. Install Helm

If you don't have Helm installed, follow these steps:

### Windows

```powershell
# Using winget (recommended)
winget install Helm.Helm

# After installation, restart your terminal or refresh PATH
# Verify installation
helm version
```

### macOS

```bash
# Using Homebrew
brew install helm

# Verify installation
helm version
```

### Linux

```bash
# Download and install Helm
curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash

# Or using package manager (Ubuntu/Debian)
curl https://baltocdn.com/helm/signing.asc | gpg --dearmor | sudo tee /usr/share/keyrings/helm.gpg > /dev/null
sudo apt-get install apt-transport-https --yes
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/helm.gpg] https://baltocdn.com/helm/stable/debian/ all main" | sudo tee /etc/apt/sources.list.d/helm-stable-debian.list
sudo apt-get update
sudo apt-get install helm

# Verify installation
helm version
```

**Note:** After installation, you may need to restart your terminal for the `helm` command to be available in your PATH.

## 1. Build Docker Images

Before deploying, you need to build Docker images for all components. You can build them locally or push them to a container registry.

**Important:** The image names must match exactly what's configured in `values.yaml`. For Docker Desktop, build the images locally with the exact names shown below.

### Build Images

```bash
# Build App image
cd packages/app
docker build -t turbotic-automationai-test/app:latest .
cd ../..

# Build Realtime Server image
cd packages/realtime-server
docker build -t turbotic-automationai-test/realtime-server:latest .
cd ../..

# Build Worker Node image
cd packages/worker-node
docker build -t turbotic-automationai-test/worker-node:latest .
cd ../..

# Build Script Runner image
cd packages/script-runner
docker build -t turbotic-automationai-test/script-runner:latest .
cd ../..
```

### Push Images to Registry

If using a remote registry (Docker Hub, Azure Container Registry, etc.):

```bash
# Login to your registry (replace with your registry URL)
docker login your-registry.io

# Tag and push App image
docker tag turbotic-automationai-test/app:latest your-registry.io/turbotic-automationai-test/app:latest
docker push your-registry.io/turbotic-automationai-test/app:latest

# Tag and push Realtime Server image
docker tag turbotic-automationai-test/realtime-server:latest your-registry.io/turbotic-automationai-test/realtime-server:latest
docker push your-registry.io/turbotic-automationai-test/realtime-server:latest

# Tag and push Worker Node image
docker tag turbotic-automationai-test/worker-node:latest your-registry.io/turbotic-automationai-test/worker-node:latest
docker push your-registry.io/turbotic-automationai-test/worker-node:latest

# Tag and push Script Runner image
docker tag turbotic-automationai-test/script-runner:latest your-registry.io/turbotic-automationai-test/script-runner:latest
docker push your-registry.io/turbotic-automationai-test/script-runner:latest
```

**Note:** If you push to a registry, update the `repository` values in `values.yaml` to include your registry prefix (e.g., `your-registry.io/turbotic-automationai-test/app`).

### For Local Kubernetes (Docker Desktop/Minikube/Kind)

If using a local Kubernetes cluster, you can load images directly without pushing to a registry:

```bash
# For Docker Desktop Kubernetes (images are already available)
# No additional steps needed - Docker Desktop shares images with its Kubernetes cluster

# For Minikube
minikube image load turbotic-automationai-test/app:latest
minikube image load turbotic-automationai-test/realtime-server:latest
minikube image load turbotic-automationai-test/worker-node:latest
minikube image load turbotic-automationai-test/script-runner:latest

# For Kind
kind load docker-image turbotic-automationai-test/app:latest --name <cluster-name>
kind load docker-image turbotic-automationai-test/realtime-server:latest --name <cluster-name>
kind load docker-image turbotic-automationai-test/worker-node:latest --name <cluster-name>
kind load docker-image turbotic-automationai-test/script-runner:latest --name <cluster-name>
```

## 2. Generate Secrets

```bash
# Generate JWT Secret
JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
echo "JWT_SECRET: $JWT_SECRET"

# Generate Encryption Key
ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
echo "ENCRYPTION_KEY: $ENCRYPTION_KEY"
```

## 3. Create Values File

Copy the example values file and update it with your configuration:

```bash
# Copy the example values file
cp helm/turbotic-playground/values-example.yaml helm/turbotic-playground/values.yaml

# Edit values.yaml with your actual configuration
# Update MongoDB and RabbitMQ endpoints, secrets, etc.
```

Or create a `my-values.yaml` file with your configuration:

```yaml
# my-values.yaml
app:
  enabled: true
  image:
    repository: your-registry/turbotic-automationai-test/app
    tag: "latest"
    pullPolicy: IfNotPresent
  
  ingress:
    enabled: true
    className: "nginx"
    hosts:
      - host: turbotic.yourdomain.com
        paths:
          - path: /
            pathType: Prefix
  
  env:
    NEXT_PUBLIC_APP_URL: "https://turbotic.yourdomain.com"
    AUTOMATIONAI_ENDPOINT: "https://turbotic.yourdomain.com"
    SOCKET_BASE_URL: "http://turbotic-playground-realtime-server:3001"
    NEXT_PUBLIC_SOCKET_BASE_URL: "http://turbotic-playground-realtime-server:3001"
  
  secrets:
    mongoUri: "mongodb://user:password@mongodb-host:27017/turbotic"
    jwtSecret: "your-jwt-secret-here"
    encryptionKey: "your-32-byte-encryption-key-here"
    rabbitMqEndpoint: "amqp://user:password@rabbitmq-host:5672"
    # Optional AI services
    perplexityApiKey: "your-perplexity-key"
    azureOpenaiApiKey: "your-azure-openai-key"
    # Azure OpenAI instance name - use only the resource name (e.g., "my-resource-name")
    # Do NOT include .cognitiveservices.azure.com - the app will append .openai.azure.com automatically
    azureOpenaiInstanceName: "your-instance-name"
    azureOpenaiDeploymentName: "your-deployment-name"
    azureOpenaiApiVersion: "2024-02-15-preview"

realtimeServer:
  enabled: true
  image:
    repository: your-registry/turbotic-automationai-test/realtime-server
    tag: "latest"
  secrets:
    mongoUri: "mongodb://user:password@mongodb-host:27017/turbotic-automationai-test"

workerNode:
  enabled: true
  image:
    repository: your-registry/turbotic-automationai-test/worker-node
    tag: "latest"
  env:
    appServerUrl: "http://turbotic-playground-app:3000"
  secrets:
    mongoUri: "mongodb://user:password@mongodb-host:27017/turbotic-automationai-test"
    rabbitMqEndpoint: "amqp://user:password@rabbitmq-host:5672"
```

## 4. Install

```bash
helm install turbotic-playground ./helm/turbotic-playground \
  --namespace turbotic-automationai-test \
  --create-namespace \
  -f my-values.yaml
```

## 5. Verify

```bash
# Watch pods
kubectl get pods -n turbotic-automationai-test -w

# Check status
kubectl get all -n turbotic-automationai-test

# Check services
kubectl get svc -n turbotic-automationai-test

# Check ingress
kubectl get ingress -n turbotic-automationai-test

# View logs
kubectl logs -f deployment/turbotic-playground-app -n turbotic-automationai-test
```

## 6. Access

### Option 1: Using Port-Forward (Local Development)

For local development or testing, use port-forwarding to access the app:

```bash
# Forward port 3000 to the app service
kubectl port-forward svc/turbotic-playground-app 3000:3000 -n turbotic-automationai-test
```

Then access your application at:
- **App**: `http://localhost:3000`

**Note:** Keep the port-forward command running in a terminal. Press `Ctrl+C` to stop it.

### Option 2: Using Ingress (Production)

Once ingress is ready, access your application at:
- **App**: `https://turbotic.yourdomain.com`

## Configuration

### Using External MongoDB and RabbitMQ

#### External MongoDB

Set the MongoDB URI in secrets for all components:

```yaml
app:
  secrets:
    mongoUri: "mongodb://user:password@mongodb-host:27017/turbotic"
    # Or for MongoDB Atlas:
    # mongoUri: "mongodb+srv://user:password@cluster.mongodb.net/turbotic"

realtimeServer:
  secrets:
    mongoUri: "mongodb://user:password@mongodb-host:27017/turbotic-automationai-test"

workerNode:
  secrets:
    mongoUri: "mongodb://user:password@mongodb-host:27017/turbotic-automationai-test"
```

#### External RabbitMQ

Set the RabbitMQ endpoint in secrets:

```yaml
app:
  secrets:
    rabbitMqEndpoint: "amqp://user:password@rabbitmq-host:5672"

workerNode:
  secrets:
    rabbitMqEndpoint: "amqp://user:password@rabbitmq-host:5672"
```

**For Docker Desktop Kubernetes (local development):**
If RabbitMQ is running on your host machine, use `host.docker.internal`:

```yaml
app:
  secrets:
    rabbitMqEndpoint: "amqp://user:password@host.docker.internal:5672"

workerNode:
  secrets:
    rabbitMqEndpoint: "amqp://user:password@host.docker.internal:5672"
```

### Image Configuration

```yaml
app:
  image:
    repository: your-registry/turbotic-automationai-test/app
    tag: "v1.0.0"
    pullPolicy: IfNotPresent

realtimeServer:
  image:
    repository: your-registry/turbotic-automationai-test/realtime-server
    tag: "v1.0.0"
    pullPolicy: IfNotPresent

workerNode:
  image:
    repository: your-registry/turbotic-automationai-test/worker-node
    tag: "v1.0.0"
    pullPolicy: IfNotPresent
```

### Resource Limits

Adjust resources based on your cluster capacity:

```yaml
app:
  resources:
    limits:
      cpu: 2000m
      memory: 4Gi
    requests:
      cpu: 500m
      memory: 2Gi

realtimeServer:
  resources:
    limits:
      cpu: 1000m
      memory: 2Gi
    requests:
      cpu: 200m
      memory: 512Mi

workerNode:
  resources:
    limits:
      cpu: 1000m
      memory: 2Gi
    requests:
      cpu: 200m
      memory: 512Mi
```

### Replica Counts

Scale components as needed:

```yaml
app:
  replicaCount: 2

realtimeServer:
  replicaCount: 2

workerNode:
  replicaCount: 2
```

### Ingress Configuration

#### Using NGINX Ingress Controller

```yaml
app:
  ingress:
    enabled: true
    className: "nginx"
    annotations:
      cert-manager.io/cluster-issuer: "letsencrypt-prod"
      nginx.ingress.kubernetes.io/ssl-redirect: "true"
    hosts:
      - host: turbotic.yourdomain.com
        paths:
          - path: /
            pathType: Prefix
    tls:
      - secretName: turbotic-tls
        hosts:
          - turbotic.yourdomain.com
```

#### Using Traefik

```yaml
app:
  ingress:
    enabled: true
    className: "traefik"
    annotations:
      traefik.ingress.kubernetes.io/router.entrypoints: web,websecure
      traefik.ingress.kubernetes.io/router.tls.certresolver: letsencrypt
    hosts:
      - host: turbotic.yourdomain.com
        paths:
          - path: /
            pathType: Prefix
```

## Common Commands

### Upgrade

```bash
# Upgrade with new values
helm upgrade turbotic-playground ./helm/turbotic-playground \
  --namespace turbotic-automationai-test \
  -f my-values.yaml

# Upgrade with new image tags
helm upgrade turbotic-playground ./helm/turbotic-playground \
  --namespace turbotic-automationai-test \
  --set app.image.tag=v1.1.0 \
  --set workerNode.image.tag=v1.1.0
```

### Uninstall

```bash
helm uninstall turbotic-playground --namespace turbotic-automationai-test
```

### Scale

```bash
# Scale app replicas
kubectl scale deployment turbotic-playground-app --replicas=3 -n turbotic-automationai-test

# Scale worker-node replicas
kubectl scale deployment turbotic-playground-worker-node --replicas=2 -n turbotic-automationai-test
```

## Troubleshooting

### Check Pod Logs

```bash
# App logs
kubectl logs -f deployment/turbotic-playground-app -n turbotic-automationai-test

# Realtime server logs
kubectl logs -f deployment/turbotic-playground-realtime-server -n turbotic-automationai-test

# Worker node logs
kubectl logs -f deployment/turbotic-playground-worker-node -n turbotic-automationai-test
```

### Check Pod Status

```bash
# Get all pods
kubectl get pods -n turbotic-automationai-test

# Describe a specific pod
kubectl describe pod <pod-name> -n turbotic-automationai-test

# Check pod events
kubectl get events -n turbotic-automationai-test --sort-by='.lastTimestamp'
```

### Common Issues

1. **Pods not starting**: 
   - Check secrets are correctly set in `my-values.yaml`
   - Verify all required environment variables are provided
   - Check pod logs for specific errors

2. **Connection errors**: 
   - Verify MongoDB and RabbitMQ endpoints are correct
   - For Docker Desktop, use `host.docker.internal` instead of `localhost`
   - Ensure MongoDB and RabbitMQ are accessible from the cluster

3. **Image pull errors (ImagePullBackOff/ErrImagePull)**: 
   - For Docker Desktop: Build images locally with exact names from `values.yaml`
     ```bash
     # Build script-runner image (used dynamically by automations)
     cd packages/script-runner
     docker build -t turbotic-automationai-test/script-runner:latest .
     cd ../..
     ```
   - Verify images exist: `docker images | grep turbotic-automationai-test`
   - For remote registries: Ensure image registry credentials are set
   - Verify image tags exist in your registry
   - Check `imagePullPolicy` settings

4. **Ingress not working**: 
   - Check ingress controller is installed: `kubectl get ingressclass`
   - Verify ingress resource: `kubectl describe ingress -n turbotic-automationai-test`
   - Check ingress controller logs

5. **Worker node can't connect to RabbitMQ**:
   - Verify RabbitMQ endpoint is correct
   - For local development with Docker Desktop, use `host.docker.internal:5672`
   - Check RabbitMQ is running and accessible

6. **Worker node can't connect to MongoDB**:
   - Verify MongoDB URI is correct
   - Check MongoDB is accessible from the cluster
   - Ensure `DB_CONN_STR` environment variable is set (it's set from `mongoUri` secret)

## Security Best Practices

1. **Never commit secrets to version control**
   - Use separate values files (e.g., `my-values.yaml`) and add them to `.gitignore`
   - Use Kubernetes Secrets or external secret management (e.g., Sealed Secrets, External Secrets Operator)

2. **Enable TLS for all external communications**
   - Configure TLS in ingress for production
   - Use secure MongoDB and RabbitMQ connections (TLS/SSL)

3. **Use network policies to restrict pod-to-pod communication**
   - Implement Kubernetes NetworkPolicies to limit traffic between pods

4. **Run pods as non-root users**
   - Already configured in the chart (securityContext)

5. **Regularly update images with security patches**
   - Keep your Docker images up to date
   - Use specific image tags instead of `latest` in production

6. **Rotate secrets regularly**
   - Periodically regenerate JWT secrets and encryption keys
   - Update connection strings when credentials change

## Support

For issues and questions:
- GitHub Issues: https://github.com/TurboticAdmin/TurboticAutomationAIOpen/issues
- Documentation: https://github.com/TurboticAdmin/TurboticAutomationAIOpen
