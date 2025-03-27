Authenticated origin

Cloudflare image transformations cache resized images to aid performance. Images stored with restricted access are generally not recommended for resizing because sharing images customized for individual visitors is unsafe. However, in cases where the customer agrees to store such images in public cache, Cloudflare supports resizing images through Workers. At the moment, this is supported on authenticated AWS, Azure, Google Cloud, SecureAuth origins and origins behind Cloudflare Access.

// generate signed headers (application specific)
const signedHeaders = generatedSignedHeaders();

fetch(private_url, {
  headers: signedHeaders
  cf: {
    image: {
      format: "auto",
      "origin-auth": "share-publicly"
     }
  }
})

When using this code, the following headers are passed through to the origin, and allow your request to be successful:

    Authorization
    Cookie
    x-amz-content-sha256
    x-amz-date
    x-ms-date
    x-ms-version
    x-sa-date
    cf-access-client-id
    cf-access-client-secret

For more information, refer to:

    AWS docs ↗
    Azure docs ↗
    Google Cloud docs ↗
    Cloudflare Zero Trust docs
    SecureAuth docs ↗

