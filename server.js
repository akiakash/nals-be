const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { createClient } = require("@supabase/supabase-js");

require("dotenv").config();

const app = express();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const supabaseHealthTable = process.env.SUPABASE_HEALTHCHECK_TABLE || "profile";
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

if (!supabase) {
  console.warn("⚠️ Supabase not initialized. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY).");
}

const parseId = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const checkSupabaseConnection = async () => {
  if (!supabase) {
    return { ok: false, message: "Supabase env vars are missing" };
  }

  const { error } = await supabase
    .from(supabaseHealthTable)
    .select("id", { head: true, count: "exact" })
    .limit(1);

  if (!error || error.code === "PGRST205") {
    return {
      ok: true,
      message: !error
        ? `Supabase connected (table: ${supabaseHealthTable})`
        : `Supabase connected, but table "${supabaseHealthTable}" was not found.`,
    };
  }

  return { ok: false, message: error.message || "Supabase check failed", errorCode: error.code || null };
};

app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

const allowedDepartments = ["IT", "HR", "Finance", "Marketing", "Sales", "Support", "Admin", "Operations", "Legal", "Design"];

if (!fs.existsSync("./uploads")) fs.mkdirSync("./uploads");

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/\s/g, "_")}`),
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const ext = file.originalname.split(".").pop().toLowerCase();
    if (!["pdf", "png", "jpg", "jpeg", "webp"].includes(ext)) {
      return cb(new Error("Only PDF, PNG, JPG, JPEG, WEBP allowed"));
    }
    cb(null, true);
  },
  limits: { fileSize: 10 * 1024 * 1024 },
});

const ensureSupabase = (res) => {
  if (!supabase) {
    res.status(500).json({ message: "Supabase client is not initialized" });
    return false;
  }
  return true;
};

app.post("/addcollege", async (req, res) => {
  if (!ensureSupabase(res)) return;

  const { providerId, tradingName, instituteName, cricosCode, websiteLink, hasAgreement } = req.body;
  if (!providerId || !tradingName || !instituteName) {
    return res.status(400).json({ error: "Provider ID, Trading Name, Institute Name required" });
  }

  const { data, error } = await supabase
    .from("colleges_agreements")
    .insert([{ providerId, tradingName, instituteName, cricosCode, websiteLink, hasAgreement }])
    .select("id")
    .single();

  if (error) return res.status(500).json({ error: "Database insert error", details: error.message });
  return res.json({ message: "College saved successfully", insertId: data.id });
});

app.get("/colleges", async (req, res) => {
  if (!ensureSupabase(res)) return;
  const { data, error } = await supabase.from("colleges_agreements").select("*").order("id", { ascending: false });
  if (error) return res.status(500).json({ message: error.message });
  return res.json(data || []);
});

app.put("/colleges/:id", upload.single("file"), async (req, res) => {
  if (!ensureSupabase(res)) return;
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: "Invalid id" });

  const payload = {
    providerId: req.body.providerId,
    tradingName: req.body.tradingName,
    instituteName: req.body.instituteName,
    cricosCode: req.body.cricosCode,
    websiteLink: req.body.websiteLink,
    hasAgreement: req.body.hasAgreement,
    agreementName: req.body.agreementName,
    status: req.body.status,
    remark: req.body.remark,
    startDate: req.body.startDate,
    expireDate: req.body.expireDate,
    renewalDate: req.body.renewalDate,
    filePath: req.file ? req.file.filename : req.body.filePath,
  };

  const { error } = await supabase.from("colleges_agreements").update(payload).eq("id", id);
  if (error) return res.status(500).send("Error");
  return res.json({ message: "Updated" });
});

app.delete("/colleges/:id", async (req, res) => {
  if (!ensureSupabase(res)) return;
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: "Invalid id" });

  const { data, error } = await supabase.from("colleges_agreements").delete().eq("id", id).select("id");
  if (error) return res.status(500).json({ message: error.message });
  if (!data || data.length === 0) return res.status(404).json({ message: "Record not found ❌" });
  return res.json({ message: "Deleted successfully ✅" });
});

app.post("/addagreement", upload.single("agreementFile"), async (req, res) => {
  if (!ensureSupabase(res)) return;
  const id = parseId(req.body.collegeId);
  if (!id) return res.status(400).json({ message: "Invalid collegeId" });

  const payload = {
    agreementName: req.body.agreementName,
    startDate: req.body.startDate,
    expireDate: req.body.expireDate,
    renewalDate: req.body.renewalDate,
    status: req.body.status,
    remark: req.body.remark,
    filePath: req.file ? req.file.filename : null,
  };

  const { error } = await supabase.from("colleges_agreements").update(payload).eq("id", id);
  if (error) {
    console.error("AGREEMENT ERROR:", error.message);
    return res.status(500).json({ message: "Agreement save failed" });
  }
  return res.json({ message: "Agreement saved successfully ✅" });
});

app.post("/api/courses", async (req, res) => {
  if (!ensureSupabase(res)) return;
  const { courseId, tradingName, courseName, cricosCode, totalFee, duration, state } = req.body;
  const { data, error } = await supabase
    .from("courses")
    .insert([{ courseId, tradingName, courseName, cricosCode, totalFee, duration, state }])
    .select("id")
    .single();

  if (error) return res.status(500).json({ message: "Database insert error", details: error.message });
  return res.json({ message: "Course added successfully", id: data.id });
});

app.get("/api/courses", async (req, res) => {
  if (!ensureSupabase(res)) return;
  const { data, error } = await supabase.from("courses").select("*").order("id", { ascending: false });
  if (error) return res.status(500).json({ message: "Error fetching courses", details: error.message });
  return res.json(data || []);
});

app.put("/api/courses/:id", async (req, res) => {
  if (!ensureSupabase(res)) return;
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: "Invalid id" });
  const { courseId, tradingName, courseName, cricosCode, totalFee, duration, state } = req.body;

  const { error } = await supabase
    .from("courses")
    .update({ courseId, tradingName, courseName, cricosCode, totalFee, duration, state })
    .eq("id", id);

  if (error) return res.status(500).json({ message: "Error updating course", details: error.message });
  return res.json({ message: "Course updated successfully" });
});

app.delete("/api/courses/:id", async (req, res) => {
  if (!ensureSupabase(res)) return;
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: "Invalid id" });
  const { error } = await supabase.from("courses").delete().eq("id", id);
  if (error) return res.status(500).json({ message: "Error deleting course", details: error.message });
  return res.json({ message: "Course deleted successfully" });
});

app.get("/api/colleges_agreements", async (req, res) => {
  if (!ensureSupabase(res)) return;
  const { data, error } = await supabase
    .from("colleges_agreements")
    .select("id,tradingName")
    .order("tradingName", { ascending: true });
  if (error) return res.status(500).json({ message: "DB error", details: error.message });
  return res.json(data || []);
});

app.post("/api/upload_flyers", (req, res) => {
  if (!ensureSupabase(res)) return;

  upload.array("flyers")(req, res, async (err) => {
    if (err) return res.status(400).json({ message: "Upload failed", error: err.message });

    const providerId = parseId(req.body.providerId);
    if (!providerId || !req.files || req.files.length === 0) {
      return res.status(400).json({ message: "Missing provider or files" });
    }

    const rows = req.files.map((file) => ({ providerId, filePath: file.filename }));
    const { data, error } = await supabase.from("flyers").insert(rows).select("id");
    if (error) return res.status(500).json({ message: "Database error", details: error.message });
    return res.json({
      message: `${req.files.length} flyer(s) uploaded successfully`,
      inserted: (data || []).length,
    });
  });
});

app.get("/api/flyers", async (req, res) => {
  if (!ensureSupabase(res)) return;
  const { data: flyers, error: flyersError } = await supabase.from("flyers").select("id,providerId,filePath").order("id", { ascending: false });
  if (flyersError) return res.status(500).json({ message: flyersError.message });

  const providerIds = [...new Set((flyers || []).map((row) => row.providerId).filter(Boolean))];
  let providersById = {};
  if (providerIds.length > 0) {
    const { data: providers } = await supabase.from("colleges_agreements").select("id,tradingName").in("id", providerIds);
    providersById = Object.fromEntries((providers || []).map((p) => [p.id, p.tradingName]));
  }

  const result = (flyers || []).map((row) => ({
    id: row.id,
    filePath: row.filePath,
    tradingName: providersById[row.providerId] || "Unknown Provider",
  }));
  return res.json(result);
});

app.put("/api/flyers/:id", upload.single("file"), async (req, res) => {
  if (!ensureSupabase(res)) return;
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: "Invalid id" });

  let filePath = null;
  if (req.file) filePath = req.file.filename;
  if (!filePath && req.body.filePath && req.body.filePath !== "") filePath = req.body.filePath;
  if (!filePath) return res.status(400).json({ message: "filePath missing ❌" });

  const { data, error } = await supabase.from("flyers").update({ filePath }).eq("id", id).select("id");
  if (error) return res.status(500).json({ message: error.message });
  if (!data || data.length === 0) return res.status(404).json({ message: "Flyer not found ❌" });

  return res.json({ message: "Updated successfully ✅", filePath, changedRows: data.length });
});

app.delete("/api/flyers/:id", async (req, res) => {
  if (!ensureSupabase(res)) return;
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: "Invalid id" });
  const { error } = await supabase.from("flyers").delete().eq("id", id);
  if (error) return res.status(500).json({ message: error.message });
  return res.json({ message: "Deleted successfully ✅" });
});

app.get("/api/enrolments", async (req, res) => {
  if (!ensureSupabase(res)) return;
  const { data: enrolments, error: enrolError } = await supabase
    .from("enrolments")
    .select("id,collegeId,enrolmentUrl,username,password,email,formsData")
    .order("id", { ascending: false });
  if (enrolError) return res.status(500).json({ message: enrolError.message });

  const providerIds = [...new Set((enrolments || []).map((row) => row.collegeId).filter(Boolean))];
  let providersById = {};
  if (providerIds.length > 0) {
    const { data: providers } = await supabase.from("colleges_agreements").select("id,tradingName").in("id", providerIds);
    providersById = Object.fromEntries((providers || []).map((p) => [p.id, p.tradingName]));
  }

  const result = (enrolments || []).map((row) => ({
    ...row,
    tradingName: providersById[row.collegeId] || "Unknown Provider",
  }));
  return res.json(result);
});

app.post("/api/enrolments", upload.array("files"), async (req, res) => {
  if (!ensureSupabase(res)) return;

  const collegeId = parseId(req.body.collegeId);
  if (!collegeId) return res.status(400).json({ error: "collegeId required ❌" });

  let parsedForms = [];
  try {
    parsedForms = JSON.parse(req.body.formsData || "[]");
  } catch (e) {
    return res.status(400).json({ error: "Invalid formsData ❌" });
  }

  const files = req.files || [];
  const combined = parsedForms.map((form, index) => ({
    name: form.name,
    file: files[index] ? files[index].filename : null,
  }));

  const payload = {
    collegeId,
    enrolmentUrl: req.body.enrolmentUrl,
    username: req.body.username,
    password: req.body.password,
    email: req.body.email,
    formsData: combined,
  };

  const { error } = await supabase.from("enrolments").insert([payload]);
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ message: "Saved successfully ✅" });
});

app.put("/api/enrolments/:id", async (req, res) => {
  if (!ensureSupabase(res)) return;
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: "Invalid id" });
  const { enrolmentUrl, username, password, email } = req.body;
  const { error } = await supabase.from("enrolments").update({ enrolmentUrl, username, password, email }).eq("id", id);
  if (error) return res.status(500).json({ message: error.message });
  return res.json({ message: "Updated ✅" });
});

app.delete("/api/enrolments/:id", async (req, res) => {
  if (!ensureSupabase(res)) return;
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: "Invalid id" });
  const { error } = await supabase.from("enrolments").delete().eq("id", id);
  if (error) return res.status(500).json({ message: error.message });
  return res.json({ message: "Deleted ✅" });
});

const validateProfile = (data) => {
  const errors = [];
  if (!data.fullName) errors.push("Full Name is required");
  if (!data.email) errors.push("Email is required");
  if (!data.password) errors.push("Password is required");
  if (!data.mobile) errors.push("Mobile is required");
  if (!data.employeeId) errors.push("Employee ID is required");
  if (!data.department) errors.push("Department is required");
  if (!data.position) errors.push("Position is required");
  if (data.department && !allowedDepartments.includes(data.department)) errors.push("Department is invalid");
  return errors;
};

app.get("/api/profile", async (req, res) => {
  if (!ensureSupabase(res)) return;
  const { data, error } = await supabase.from("profile").select("*").order("id", { ascending: false });
  if (error) return res.status(500).json({ message: error.message });
  return res.json(data || []);
});

app.post("/api/profile", async (req, res) => {
  if (!ensureSupabase(res)) return;
  const errors = validateProfile(req.body);
  if (errors.length > 0) return res.status(400).json(errors);

  const { fullName, email, password, mobile, country, employeeId, department, position } = req.body;
  const { data: exists, error: existsError } = await supabase.from("profile").select("id").eq("email", email).limit(1);
  if (existsError) return res.status(500).json({ message: existsError.message });
  if (exists && exists.length > 0) return res.status(400).json(["Email already exists"]);

  const { data, error } = await supabase
    .from("profile")
    .insert([{ fullName, email, password, mobile, country, employeeId, department, position }])
    .select("*")
    .single();

  if (error) return res.status(500).json({ message: error.message });
  return res.json(data);
});

app.put("/api/profile/:id", async (req, res) => {
  if (!ensureSupabase(res)) return;
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: "Invalid id" });

  const payload = {
    fullName: req.body.fullName || "",
    email: req.body.email || "",
    password: req.body.password || "",
    mobile: req.body.mobile || "",
    country: req.body.country || "",
    employeeId: req.body.employeeId || "",
    department: req.body.department || "",
    position: req.body.position || "",
  };

  const { error } = await supabase.from("profile").update(payload).eq("id", id);
  if (error) return res.status(500).json({ message: "DB error", error: error.message });
  return res.json({ message: "Updated successfully" });
});

app.delete("/api/profile/:id", async (req, res) => {
  if (!ensureSupabase(res)) return;
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: "Invalid id" });
  const { error } = await supabase.from("profile").delete().eq("id", id);
  if (error) return res.status(500).json({ message: error.message });
  return res.json({ message: "Deleted successfully" });
});

app.post("/login", async (req, res) => {
  if (!ensureSupabase(res)) return;
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ success: false, message: "Email and Password required" });
  }

  const { data: users, error } = await supabase.from("profile").select("*").eq("email", email).limit(1);
  if (error) {
    console.error("DB ERROR:", error.message);
    return res.status(500).json({ success: false, message: "Database error" });
  }
  if (!users || users.length === 0) {
    return res.status(401).json({ success: false, message: "Email not found" });
  }

  const user = users[0];
  if (user.password !== password) {
    return res.status(401).json({ success: false, message: "Incorrect password" });
  }

  return res.json({ success: true, message: "Login successful", user });
});

app.get("/api/health/supabase", async (req, res) => {
  try {
    const result = await checkSupabaseConnection();
    if (!result.ok) return res.status(500).json(result);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message || "Unexpected Supabase health error" });
  }
});

const PORT = Number(process.env.PORT) || 5050;
app.listen(PORT, async () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  const supabaseStatus = await checkSupabaseConnection();
  if (supabaseStatus.ok) {
    console.log(`✅ ${supabaseStatus.message}`);
  } else {
    console.error(`❌ ${supabaseStatus.message}`);
  }
});