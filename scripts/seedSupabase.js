const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: ".env" });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error(
    "Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY) in backend/.env"
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const seedData = {
  profile: [
    {
      fullName: "Admin User",
      email: "admin@nals.local",
      password: "admin123",
      mobile: "0411000001",
      country: "Australia",
      employeeId: "EMP-001",
      department: "IT",
      position: "Administrator",
    },
    {
      fullName: "Admissions Manager",
      email: "admissions@nals.local",
      password: "admissions123",
      mobile: "0411000002",
      country: "Australia",
      employeeId: "EMP-002",
      department: "Operations",
      position: "Manager",
    },
  ],
  colleges_agreements: [
    {
      providerId: "PVD-1001",
      tradingName: "NALS College Sydney",
      instituteName: "NALS Institute of Business",
      cricosCode: "010203A",
      websiteLink: "https://example.edu.au",
      hasAgreement: "Yes",
    },
    {
      providerId: "PVD-1002",
      tradingName: "NALS College Melbourne",
      instituteName: "NALS Institute of Technology",
      cricosCode: "020304B",
      websiteLink: "https://example-tech.edu.au",
      hasAgreement: "No",
    },
  ],
  courses: [
    {
      courseId: "CRS-1001",
      tradingName: "NALS College Sydney",
      courseName: "Diploma of Information Technology",
      cricosCode: "111111A",
      totalFee: "12000",
      duration: "52 weeks",
      state: "NSW",
    },
    {
      courseId: "CRS-1002",
      tradingName: "NALS College Melbourne",
      courseName: "Advanced Diploma of Leadership",
      cricosCode: "222222B",
      totalFee: "9800",
      duration: "48 weeks",
      state: "VIC",
    },
  ],
};

const upsertTable = async (table, rows, onConflict) => {
  const query = supabase.from(table).upsert(rows, { onConflict });
  const { error } = await query;

  if (!error) {
    console.log(`Seeded ${table}: ${rows.length} row(s)`);
    return;
  }

  // These are commonly returned when a table or columns don't exist yet.
  if (error.code === "PGRST205" || error.code === "42P01" || error.code === "42703") {
    console.warn(`Skipped ${table}: ${error.message}`);
    return;
  }

  throw new Error(`${table}: ${error.message}`);
};

const run = async () => {
  try {
    await upsertTable("profile", seedData.profile, "email");
    await upsertTable(
      "colleges_agreements",
      seedData.colleges_agreements,
      "providerId"
    );
    await upsertTable("courses", seedData.courses, "courseId");

    const { data: college, error: collegeError } = await supabase
      .from("colleges_agreements")
      .select("id")
      .eq("providerId", "PVD-1001")
      .limit(1)
      .single();

    if (!collegeError && college?.id) {
      const { data: flyerExists, error: flyerCheckError } = await supabase
        .from("flyers")
        .select("id")
        .eq("providerId", college.id)
        .eq("filePath", "sample-flyer.pdf")
        .limit(1);
      if (flyerCheckError && flyerCheckError.code !== "PGRST205" && flyerCheckError.code !== "42P01") {
        throw new Error(`flyers: ${flyerCheckError.message}`);
      }
      if (!flyerCheckError && (!flyerExists || flyerExists.length === 0)) {
        const { error: flyerInsertError } = await supabase
          .from("flyers")
          .insert([{ providerId: college.id, filePath: "sample-flyer.pdf" }]);
        if (flyerInsertError && flyerInsertError.code !== "PGRST205" && flyerInsertError.code !== "42P01") {
          throw new Error(`flyers: ${flyerInsertError.message}`);
        } else if (!flyerInsertError) {
          console.log("Seeded flyers: 1 row");
        }
      }

      const { data: enrolmentExists, error: enrolmentCheckError } = await supabase
        .from("enrolments")
        .select("id")
        .eq("email", "enrolment@nals.local")
        .eq("collegeId", college.id)
        .limit(1);
      if (
        enrolmentCheckError &&
        enrolmentCheckError.code !== "PGRST205" &&
        enrolmentCheckError.code !== "42P01"
      ) {
        throw new Error(`enrolments: ${enrolmentCheckError.message}`);
      }
      if (!enrolmentCheckError && (!enrolmentExists || enrolmentExists.length === 0)) {
        const { error: enrolmentInsertError } = await supabase
          .from("enrolments")
          .insert([
            {
              collegeId: college.id,
              enrolmentUrl: "https://enrol.example.edu.au",
              username: "student_portal",
              password: "portal123",
              email: "enrolment@nals.local",
              formsData: [
                { name: "Passport", file: null },
                { name: "Academic Transcript", file: null },
              ],
            },
          ]);
        if (
          enrolmentInsertError &&
          enrolmentInsertError.code !== "PGRST205" &&
          enrolmentInsertError.code !== "42P01"
        ) {
          throw new Error(`enrolments: ${enrolmentInsertError.message}`);
        } else if (!enrolmentInsertError) {
          console.log("Seeded enrolments: 1 row");
        }
      }
    }

    console.log("Supabase seed completed.");
    process.exit(0);
  } catch (error) {
    console.error(`Supabase seed failed: ${error.message}`);
    process.exit(1);
  }
};

run();
