<table_of_contents color="blue"/>

# Amazon S3 (Simple Storage Service) - AWS CCP Exam Notes {color="blue"}

<callout icon="📦" color="blue_bg">
**Amazon S3** is an **object storage service** that offers industry-leading scalability, data availability, security, and performance. It is designed for **99.999999999% (11 9s) durability** and stores data as objects within buckets.
</callout>

---

## 1. S3 Overview & Core Concepts {color="blue"}

### What is Amazon S3?
- **Object storage service** — stores data as objects (file + metadata) in buckets
- **Virtually unlimited storage** — no limit on number of objects
- **Max object size**: 5 TB (single upload max 5 GB; use multipart upload for larger files)
- **Strong read-after-write consistency** for all PUT and DELETE operations
- **Pay-as-you-go pricing** — pay only for what you use
- **Global service** but buckets are created in a specific AWS Region

### Key Terminology

<table header-row="true" fit-page-width="true">
<colgroup><col color="blue_bg"><col></colgroup>
<tr><td>**Term**</td><td>**Definition**</td></tr>
<tr><td>Bucket</td><td>Container for objects. Must have a globally unique name. Created in a specific AWS Region.</td></tr>
<tr><td>Object</td><td>The fundamental entity stored in S3 — consists of data, key (name), and metadata.</td></tr>
<tr><td>Key</td><td>The unique identifier for an object within a bucket (full path including prefix).</td></tr>
<tr><td>Version ID</td><td>A unique identifier assigned when versioning is enabled.</td></tr>
<tr><td>Metadata</td><td>Key-value pairs that describe the object (system + user-defined).</td></tr>
<tr><td>Region</td><td>The AWS Region where the bucket is physically stored.</td></tr>
</table>

### Bucket Types (CCP Awareness)
- **General Purpose Buckets** — recommended for most use cases, flat storage structure
- **Directory Buckets** — optimized for low-latency, hierarchical directory structure (S3 Express One Zone)
- **Table Buckets** — for tabular/analytics data (S3 Tables)
- **Vector Buckets** — purpose-built for storing and querying vector data

---

## 2. S3 Storage Classes {color="purple"}

<callout icon="💡" color="yellow_bg">
**CCP Exam Tip**: You MUST know all storage classes, their use cases, availability, and retrieval times. This is heavily tested!
</callout>

### Storage Classes Comparison Table

<table header-row="true" header-column="true" fit-page-width="true">
<colgroup><col color="gray_bg"><col><col><col><col><col></colgroup>
<tr><td>**Storage Class**</td><td>**Use Case**</td><td>**Availability**</td><td>**Durability**</td><td>**Retrieval Time**</td><td>**Min Storage Duration**</td></tr>
<tr><td>S3 Standard</td><td>Frequently accessed data</td><td>99.99%</td><td>99.999999999%</td><td>Milliseconds</td><td>None</td></tr>
<tr><td>S3 Express One Zone</td><td>Ultra-low latency (single-digit ms)</td><td>99.95%</td><td>99.999999999%</td><td>Single-digit ms</td><td>1 hour</td></tr>
<tr><td>S3 Intelligent-Tiering</td><td>Unknown/changing access patterns</td><td>99.9%</td><td>99.999999999%</td><td>Milliseconds</td><td>None</td></tr>
<tr><td>S3 Standard-IA</td><td>Infrequent access, multi-AZ</td><td>99.9%</td><td>99.999999999%</td><td>Milliseconds</td><td>30 days</td></tr>
<tr><td>S3 One Zone-IA</td><td>Infrequent access, single AZ</td><td>99.5%</td><td>99.999999999%</td><td>Milliseconds</td><td>30 days</td></tr>
<tr><td>S3 Glacier Instant Retrieval</td><td>Archive with instant access</td><td>99.9%</td><td>99.999999999%</td><td>Milliseconds</td><td>90 days</td></tr>
<tr><td>S3 Glacier Flexible Retrieval</td><td>Archive, minutes-to-hours retrieval</td><td>99.99%</td><td>99.999999999%</td><td>1 min - 12 hours</td><td>90 days</td></tr>
<tr><td>S3 Glacier Deep Archive</td><td>Long-term archive, lowest cost</td><td>99.99%</td><td>99.999999999%</td><td>12 - 48 hours</td><td>180 days</td></tr>
</table>

### S3 Intelligent-Tiering Details
S3 Intelligent-Tiering automatically moves objects between access tiers:
- **Frequent Access** tier — default tier for uploaded objects
- **Infrequent Access** tier — objects not accessed for 30 days
- **Archive Instant Access** tier — objects not accessed for 90 days
- **Archive Access** tier (optional) — objects not accessed for 90+ days
- **Deep Archive Access** tier (optional) — objects not accessed for 180+ days

<callout icon="⚠️" color="orange_bg">
Objects smaller than 128 KB are NOT monitored and always stay in the Frequent Access tier.
</callout>

---

## 3. S3 Security & Access Control {color="red"}

### S3 is Private by Default
- All new buckets are **private by default**
- Only the bucket owner has access initially

### Access Management Methods

<table header-row="true" fit-page-width="true">
<colgroup><col color="red_bg"><col></colgroup>
<tr><td>**Method**</td><td>**Description**</td></tr>
<tr><td>IAM Policies</td><td>Identity-based policies attached to IAM users, groups, or roles to control S3 access</td></tr>
<tr><td>Bucket Policies</td><td>Resource-based JSON policies attached directly to the bucket — can grant cross-account access</td></tr>
<tr><td>S3 Block Public Access</td><td>Account-level and bucket-level settings to block all public access (enabled by default)</td></tr>
<tr><td>Access Control Lists (ACLs)</td><td>Legacy mechanism — AWS recommends using bucket policies instead. ACLs are disabled by default.</td></tr>
<tr><td>S3 Access Points</td><td>Named network endpoints with dedicated access policies for shared datasets</td></tr>
<tr><td>S3 Object Ownership</td><td>Controls ownership of objects uploaded by other accounts. Default: Bucket owner enforced (ACLs disabled)</td></tr>
<tr><td>IAM Access Analyzer</td><td>Evaluates and monitors bucket access policies to ensure intended access only</td></tr>
</table>

### Encryption

<callout icon="🔒" color="green_bg">
**As of January 2023**, Amazon S3 automatically encrypts ALL new objects using **SSE-S3** (Server-Side Encryption with S3-managed keys) at no additional cost.
</callout>

**Encryption Types:**
1. **SSE-S3** — Server-Side Encryption with Amazon S3-managed keys (AES-256). Default encryption.
2. **SSE-KMS** — Server-Side Encryption with AWS KMS keys. Provides audit trail via CloudTrail.
3. **DSSE-KMS** — Dual-layer Server-Side Encryption with AWS KMS keys (two layers of encryption).
4. **SSE-C** — Server-Side Encryption with Customer-Provided keys. You manage the keys.
5. **Client-Side Encryption** — Encrypt data before uploading to S3.

### MFA Delete
- Requires MFA to permanently delete object versions or suspend versioning
- Adds an extra layer of protection against accidental/malicious deletion

---

## 4. S3 Versioning {color="green"}

<callout icon="📝" color="green_bg">
**S3 Versioning** keeps multiple versions of every object in a bucket. It protects against accidental deletion and overwrites.
</callout>

### Key Points:
- Versioning is enabled at the **bucket level**
- Once enabled, it **cannot be disabled** — only suspended
- Each version gets a unique **Version ID**
- Deleting an object adds a **delete marker** (the object can be recovered)
- Permanently deleting requires specifying the Version ID
- **Best practice**: Enable versioning for data protection

---

## 5. S3 Replication {color="orange"}

### Cross-Region Replication (CRR)
- Replicates objects across **different AWS Regions**
- Use cases: compliance, lower latency access, cross-account replication

### Same-Region Replication (SRR)
- Replicates objects within the **same AWS Region**
- Use cases: log aggregation, live replication between production and test accounts

### Requirements:
- Source and destination buckets must have **versioning enabled**
- S3 must have proper **IAM permissions** to replicate objects
- Replication is **not retroactive** — only new objects after enabling are replicated

---

## 6. S3 Lifecycle Policies {color="brown"}

<callout icon="⏰" color="brown_bg">
Lifecycle policies automate transitioning objects between storage classes or expiring (deleting) objects to optimize costs.
</callout>

### Transition Actions:
- Move objects from S3 Standard → S3 Standard-IA → S3 Glacier → S3 Glacier Deep Archive
- Can be based on object age (days after creation)

### Expiration Actions:
- Delete objects after a specified period
- Delete old versions of objects
- Delete incomplete multipart uploads

### Example Flow:
S3 Standard (Day 0) → S3 Standard-IA (Day 30) → S3 Glacier Flexible Retrieval (Day 60) → S3 Glacier Deep Archive (Day 180)

---

## 7. S3 Transfer & Performance {color="purple"}

### S3 Transfer Acceleration
- Uses **Amazon CloudFront edge locations** to accelerate uploads
- Data is routed over AWS optimized network backbone
- Best for long-distance transfers (cross-continent)
- Uses endpoint: `bucketname.s3-accelerate.amazonaws.com`

### Multipart Upload
- **Recommended for files > 100 MB**, required for files > 5 GB
- Upload parts in parallel for better throughput
- Can pause and resume uploads

### S3 Byte-Range Fetches
- Download specific byte ranges of an object
- Useful for downloading partial files or parallelizing downloads

---

## 8. S3 Data Transfer & Migration {color="gray"}

### AWS Snow Family
For large-scale data migration when network transfer is too slow:

<table header-row="true" fit-page-width="true">
<colgroup><col color="gray_bg"><col><col><col></colgroup>
<tr><td>**Device**</td><td>**Storage Capacity**</td><td>**Use Case**</td><td>**Migration Size**</td></tr>
<tr><td>Snowcone</td><td>8 TB HDD / 14 TB SSD</td><td>Small edge computing + data transfer</td><td>Up to TBs</td></tr>
<tr><td>Snowball Edge Storage</td><td>80 TB</td><td>Large data migration</td><td>TBs to PBs</td></tr>
<tr><td>Snowball Edge Compute</td><td>42 TB + 28TB NVMe</td><td>Edge computing + data migration</td><td>TBs to PBs</td></tr>
<tr><td>Snowmobile</td><td>100 PB</td><td>Massive data migration (exabyte scale)</td><td>Up to EBs</td></tr>
</table>

---

## 9. S3 Additional Features {color="blue"}

### S3 Event Notifications
- Trigger actions when events occur (object created, deleted, etc.)
- Destinations: SNS, SQS, Lambda, EventBridge

### S3 Object Lock
- **WORM model** (Write Once Read Many)
- Prevents objects from being deleted or overwritten
- Two modes: **Governance Mode** (most users can't override) and **Compliance Mode** (no one can override, including root)

### S3 Select & S3 Glacier Select
- Retrieve specific data from objects using SQL expressions
- Reduces data transfer — only get the data you need

### S3 Storage Lens
- Organization-wide visibility into storage usage and activity
- 60+ usage and activity metrics
- Interactive dashboards

### S3 Batch Operations
- Perform large-scale batch operations on billions of objects
- Operations: copy, invoke Lambda, restore, tag, encrypt

### S3 Static Website Hosting
- Host static websites directly from an S3 bucket
- URL format: `http://bucket-name.s3-website-region.amazonaws.com`
- Must enable public access and set a bucket policy for public reads

---

## 10. S3 Pricing Overview {color="green"}

<callout icon="💰" color="green_bg">
**CCP Exam Tip**: Know the pricing model — you pay for storage, requests, data transfer out, and optional features.
</callout>

### You Pay For:
1. **Storage** — per GB/month, varies by storage class
2. **Requests** — PUT, COPY, POST, LIST, GET, SELECT requests
3. **Data Transfer OUT** — data transferred out of S3 to the internet (data IN is free)
4. **Management & Analytics** — Storage Lens, inventory, analytics, object tagging
5. **Replication** — data transfer for CRR/SRR
6. **S3 Transfer Acceleration** — additional per-GB charge

### Free:
- Data transfer IN to S3 from the internet
- Data transfer between S3 and EC2 in the same region
- Data transfer between S3 and CloudFront

---

## 11. Key Exam Tips & Summary {color="red"}

<callout icon="🎯" color="red_bg">
**Must-Know for CCP Exam:**
</callout>

- S3 is **object storage** (not block or file storage)
- **11 9s durability** (99.999999999%) across ALL storage classes
- **Bucket names must be globally unique**
- **S3 is a global service** but buckets live in a specific region
- **Block Public Access** is ON by default
- **SSE-S3** encryption is automatic for all new objects
- **Versioning** protects against accidental deletes (delete markers)
- **Lifecycle policies** transition objects between storage classes to save costs
- **S3 Intelligent-Tiering** is best for unknown/changing access patterns
- **S3 Glacier Deep Archive** is the cheapest storage (12-48 hour retrieval)
- **Transfer Acceleration** uses CloudFront edge locations
- **Snow Family** for offline/physical data migration
- **CRR** requires versioning on both source and destination
- **S3 is NOT a database** — it's for storing files/objects
- **Max object size = 5 TB**; use multipart upload for files > 100 MB

---

<callout icon="📚" color="blue_bg">
**Related AWS Services**: Amazon EC2, Amazon EBS, Amazon EFS, Amazon CloudFront, AWS Snow Family, AWS Transfer Family, AWS Storage Gateway, Amazon Macie
</callout>

---
