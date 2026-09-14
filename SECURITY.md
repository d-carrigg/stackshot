# Security

Please report vulnerabilities privately via
[GitHub security advisories](https://github.com/d-carrigg/stackshot/security/advisories/new)
rather than a public issue.

The web composer runs in the browser. Panels, images, and exports are not
uploaded. The page loads cookieless analytics from `cloud.umami.is`.

The CLI reads local files and writes images with Pillow. Treat untrusted
image/code input the way you would any other local image tool.
