> Source: https://docs.aws.amazon.com/ebs/latest/userguide/what-is-ebs.html
> Source: https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/storage_ebs.html
> Source: https://docs.aws.amazon.com/ebs/latest/userguide/ebs-volumes-multi.html
> Source: https://aws.amazon.com/ebs/volume-types/

# EC2 Instance Storage — Amazon EBS (CCP Focus)

## What is Amazon EBS?

Amazon Elastic Block Store (Amazon EBS) provides scalable, high-performance **block storage** resources that can be attached to Amazon EC2 instances. Once attached, an EBS volume behaves like a local hard drive — but it is actually a **network drive**, not a physical drive on the host machine.

With EBS you create and manage two resource types:

- **EBS Volumes** — storage devices attached to EC2 instances (act like local disks).
- **EBS Snapshots** — point-in-time backups of EBS volumes, stored independently in Amazon S3.

## Key CCP Concepts (Memorize These)

| Concept | Detail |
| --- | --- |
| Storage type | Block storage (raw, unformatted block device) |
| Attachment model (CCP default) | **1 EBS volume → 1 EC2 instance at a time** |
| Multi-Attach | Available on `io1` / `io2` only (Solutions Architect / Developer / SysOps topic — NOT CCP) |
| Locality | **Bound to a single Availability Zone** (e.g., a volume in `us-east-1a` cannot be attached in `us-east-1b`) |
| Persistence | **Persists** independently of the EC2 instance (survives stop/terminate if "Delete on Termination" is off) |
| Connection | Network drive — slight network latency, but easily detached and re-attached |
| Provisioning | You provision capacity (GB) and IOPS up front — you pay for what you provision |
| Resize | Capacity and performance can be increased without downtime (Elastic Volumes) |
| Cross-AZ move | Not directly possible — must take a **snapshot** first, then restore in target AZ |

## EBS Volume Types

EBS volumes fall into two categories: **SSD-backed** (low latency, IOPS-heavy workloads) and **HDD-backed** (throughput-heavy, sequential workloads).

### SSD-backed volumes

| Type | Max IOPS | Max Throughput | Use Case |
| --- | --- | --- | --- |
| **gp3** (General Purpose SSD) | 16,000 | 1,000 MB/s | Boot volumes, dev/test, low-latency interactive apps. Best price/perf — recommended over gp2. |
| **gp2** (General Purpose SSD) | 16,000 | 250 MB/s | Legacy default boot volume — IOPS scales with size |
| **io1** (Provisioned IOPS SSD) | 64,000 | 1,000 MB/s | High-IOPS critical databases, virtual desktops, gaming |
| **io2 Block Express** (Provisioned IOPS SSD) | 256,000 | 4,000 MB/s | Mission-critical DBs (SAP HANA, Oracle, MS SQL Server, IBM DB2). 99.999% durability. Supports Multi-Attach with I/O fencing. |

### HDD-backed volumes

| Type | Max IOPS | Max Throughput | Use Case |
| --- | --- | --- | --- |
| **st1** (Throughput Optimized HDD) | 500 | 500 MB/s | Big data, data warehouses, log processing |
| **sc1** (Cold HDD) | 250 | 250 MB/s | Infrequently accessed data — lowest cost per GB |

> **CCP exam tip:** Only **gp2/gp3 and io1/io2** can be used as **boot volumes**. HDD volumes (`st1`, `sc1`) cannot be boot volumes.

## EBS Multi-Attach (Beyond CCP — for awareness)

EBS Multi-Attach lets a single Provisioned IOPS SSD (`io1` or `io2`) volume attach to **up to 16 EC2 instances** in the **same Availability Zone**.

- Free of charge — only pay standard `io1`/`io2` pricing.
- Each instance gets full read/write to the shared volume.
- Requires a **cluster-aware filesystem** (XFS / EXT4 are NOT safe).
- `io2` supports **I/O fencing** for data consistency; `io1` does not.
- Cannot be used as a boot volume.
- Use cases: shared databases, clustered apps requiring concurrent writes, high-availability architectures.

## EBS Snapshots

A snapshot is a **point-in-time backup** of an EBS volume, stored in Amazon S3 (managed by AWS, you don't see the bucket).

- Snapshots are **incremental** — only the changed blocks since the last snapshot are stored.
- Snapshots are **encrypted, durable**, and **persist independently** from the source volume.
- You can **copy snapshots** across **AZs and Regions** — this is how you migrate data across AZs/Regions.
- Used for backups, disaster recovery, AMI creation, and volume resizing.
- **EBS Snapshots Archive** = lower-cost tier for snapshots retained 90+ days.
- **Recycle Bin** = recover accidentally deleted snapshots.

## EBS vs EC2 Instance Store

| Property | EBS Volume | Instance Store |
| --- | --- | --- |
| Type | Network-attached block storage | Physically attached to host machine |
| Persistence | **Persistent** (survives stop/terminate) | **Ephemeral** (lost on stop/terminate or hardware failure) |
| AZ binding | Bound to one AZ | Bound to host hardware |
| Detach / re-attach | Yes | No |
| Snapshots | Yes (to S3) | Not directly |
| Latency | Slight network latency | Very low (local disk) |
| IOPS | Up to 256,000 (io2 BE) | Millions (NVMe local SSD) |
| Use case | Databases, persistent app data, root volumes | Cache, buffer, temp files, scratch space, ML training shards |

## Encryption & Security

- EBS volumes can be **encrypted at rest** using AWS KMS (AES-256).
- Data **in-transit** between EC2 and the volume is also encrypted when encryption is on.
- Snapshots from encrypted volumes are automatically encrypted.
- You can enable **encryption by default** at the account/Region level — recommended.

## Pricing Model

- You pay for **provisioned capacity (GB-month)** — not for what you use inside the volume.
- For `io1` / `io2`, you also pay per **provisioned IOPS-month**.
- Snapshots are billed by the GB-month of changed blocks stored in S3.
- Multi-Attach has **no extra charge**.
- **Stopped instances** still incur EBS volume charges (volume keeps existing).

## Related AWS Services

- **AWS KMS** — encryption keys for EBS at rest.
- **Amazon Data Lifecycle Manager (DLM)** — automate snapshot creation, retention, deletion.
- **AWS Backup** — centralized backup management for EBS + other AWS resources.
- **EBS direct APIs** — read/write snapshot data without restoring a volume.
- **Recycle Bin** — recover deleted snapshots and AMIs.
- **Amazon CloudWatch** — monitor EBS volume metrics (IOPS, throughput, queue length).
