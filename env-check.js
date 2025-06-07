// Simple script to check if your environment variables are set correctly
// Run this on your backend server with: node env-check.js

console.log("🔍 Checking environment variables...\n")

const requiredVars = ["PORT", "SPOTIFY_CLIENT_ID", "SPOTIFY_CLIENT_SECRET"]

const results = {
  set: [],
  missing: [],
}

for (const varName of requiredVars) {
  if (process.env[varName]) {
    results.set.push({
      name: varName,
      value: varName.includes("SECRET") ? "********" : process.env[varName],
    })
  } else {
    results.missing.push(varName)
  }
}

console.log("✅ Variables that are set:")
if (results.set.length > 0) {
  results.set.forEach((v) => {
    console.log(`   ${v.name}: ${v.value}`)
  })
} else {
  console.log("   None")
}

console.log("\n❌ Variables that are missing:")
if (results.missing.length > 0) {
  results.missing.forEach((v) => {
    console.log(`   ${v}`)
  })
} else {
  console.log("   None - all required variables are set!")
}

console.log("\n📋 Summary:")
console.log(`   ${results.set.length} variables set, ${results.missing.length} variables missing`)

if (results.missing.length > 0) {
  console.log("\n⚠️ Your backend might not work correctly without these variables!")
  console.log("   Make sure to set them in your Render environment variables.")
} else {
  console.log("\n✨ All required environment variables are set!")
}
