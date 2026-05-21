> Source: https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/AMIs.html
> Source: https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ami-lifecycle.html
> Source: https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ComponentsAMIs.html
> Source: https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/creating-an-ami-ebs.html

# Amazon Machine Image (AMI) — CCP Focus

## What is an AMI?

An **Amazon Machine Image (AMI)** is a pre-configured **template** used to launch EC2 instances. It contains:

- The **operating system** (Linux, Windows, macOS)
- **Application server / middleware** (e.g. Apache, IIS, .NET runtime)
- **Applications** and any software you've installed
- **Block device mappings** — which volumes (EBS or instance store) attach when launched
- **Launch permissions** — who can use the AMI

> Mental model: An AMI is a "frozen snapshot of a fully-configured server" you can stamp out into many identical EC2 instances on demand.

## Why AMIs matter for CCP

| # | Concept | What to remember |
| --- | --- | --- |
| 1 | **Purpose** | Pre-baked image used to **launch EC2 instances**. |
| 2 | **Region scope** | AMI is **specific to one AWS Region**. To use in another Region, you must **copy** the AMI. |
| 3 | **Customization** | You can build your own AMI from a running EC2 → faster boot, pre-installed software. |
| 4 | **Sources** | AWS-provided, AWS Marketplace, Community, or Custom (your own). |
| 5 | **Storage** | EBS-backed AMIs are stored as **EBS snapshots** in Amazon S3 (managed by AWS). |
| 6 | **Pricing** | AMI itself is **free** (you pay for the EBS snapshots + EC2 it launches). Marketplace AMIs may add a license fee. |

## AMI Characteristics (each AMI is specific to)

1. **AWS Region** — AMIs do not cross Regions automatically.
2. **Operating System** — Linux, Windows, macOS, etc.
3. **Processor architecture** — x86_64, ARM64 (Graviton), etc.
4. **Root volume type** — EBS-backed (default) or Instance-store-backed.
5. **Virtualization type** — HVM (current) or PV (legacy).

## The 4 Sources of AMIs

### 1. AWS-provided AMIs (Quick Start)
- Maintained by AWS — Amazon Linux 2023, Ubuntu, Windows Server, RHEL, SUSE, etc.
- Free to use — you only pay for EC2 + EBS.
- Patched and updated regularly.

### 2. AWS Marketplace AMIs
- Pre-configured images from third-party vendors (SAP, IBM, Bitnami, Trend Micro, etc.).
- Often include licensed software — added hourly or annual fee on top of EC2.
- Trusted, reviewed by AWS.

### 3. Community AMIs
- Public AMIs shared by other AWS users.
- Free, but **use with caution** — AWS does not vet them.

### 4. Custom AMIs (My AMIs)
- You create them from your own customized EC2 instance.
- Region-bound — copy to multiple Regions if needed.
- Most common in production for consistency.

## AMI Lifecycle

```
Launch existing AMI → Customize EC2 → Create AMI → (Copy / Share / Use to launch)
                                                 ↓
                                          Deprecate / Disable / Deregister
```

- **Create** — Take a base AMI, launch an EC2, install software/configure, then create a new AMI from that instance. AWS automatically takes EBS snapshots of all attached volumes.
- **Copy** — Replicate an AMI to another AWS Region (DR, multi-Region apps, compliance).
- **Share** — Give specific AWS accounts permission to use the AMI, or make it public.
- **Deprecate** — Mark AMI as old. Hidden from listings but still usable if you know the ID.
- **Disable** — Temporarily prevent new launches. Can re-enable later.
- **Deregister (Delete)** — Permanent. Goes to Recycle Bin if a retention rule matches; otherwise deleted immediately. **Existing instances are unaffected.**

## EBS-backed vs Instance-store-backed AMIs

| Property | EBS-backed AMI | Instance-store-backed AMI |
| --- | --- | --- |
| Root volume | EBS volume (persistent) | Instance store (ephemeral) |
| Boot time | Faster (~1 min) | Slower (~5 min) — image copied from S3 |
| Stop instance? | ✅ Yes | ❌ No — can only terminate |
| Data persists? | ✅ Yes (volume survives stop) | ❌ Lost on stop/terminate |
| Recommended? | ✅ **Default and recommended** | ❌ Legacy — rarely used today |

> **CCP exam tip:** Default and recommended is **EBS-backed**. Instance-store-backed is legacy.

## Custom AMI — 5 Key Benefits

1. **Faster boot time** — software is pre-installed, no install scripts on launch.
2. **Pre-installed packages** — apps, agents, security tools all baked in.
3. **Enhanced security** — security patches, hardening, monitoring agents pre-applied.
4. **Consistent configurations** — identical images across an Auto Scaling Group.
5. **Reduced launch errors** — no failed launches due to user-data script bugs.

## AMI Region Scope and Cross-Region Copy

- AMIs live in **one Region only**.
- To deploy in another Region, use the **Copy AMI** action — AWS replicates the snapshots to the target Region and registers a new AMI.
- Common scenarios:
  - **Disaster Recovery** (active-passive across Regions)
  - **Multi-Region applications** (low latency for global users)
  - **Compliance / data residency** (data must stay in a specific country)
- When copying, you can change encryption settings (e.g. encrypt an unencrypted source).

## AMI Encryption

- EBS snapshots backing the AMI can be encrypted with **AWS KMS**.
- Snapshots from encrypted volumes ⇒ **automatically encrypted AMIs**.
- You can enable EBS Encryption by Default at account/Region level.

## Related AWS Services

- **EC2 Image Builder** — managed pipeline service to automate AMI creation, testing, distribution.
- **Amazon Data Lifecycle Manager (DLM)** — automate AMI/snapshot creation, retention, deprecation, deregistration.
- **AWS Backup** — centralized backup management including AMIs.
- **AWS Marketplace** — buy/sell AMIs.
- **Recycle Bin** — recover deregistered AMIs within retention window.
- **AWS Systems Manager Parameter Store** — publishes the **latest** Amazon Linux/Windows AMI IDs.

## Pricing

- AMI itself is **free**.
- You pay for:
  - The **EBS snapshots** that back the AMI (GB-month).
  - Any **Marketplace license fees** (per hour / annual).
  - Standard EC2 costs for the instances launched from the AMI.
- Cross-Region copies incur **data transfer** charges.
