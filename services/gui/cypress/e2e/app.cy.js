import "cypress-file-upload";

describe("KUBRA GUI E2E", () => {
  beforeEach(() => {
    // نفتح الصفحة الرئيسية قبل كل اختبار
    cy.visit("/");
  });

  it("loads dashboard layout", () => {
    cy.contains("KUBRA").should("be.visible");
    cy.contains("System Metrics").should("be.visible");
    cy.contains("Audio / Brain Visualization").should("be.visible");
  });

  it("encodes text and shows result table", () => {
    cy.get('input[label="Input"]').should("exist").type("hello world");
    cy.get('button').contains("إرسال").click();
    cy.contains("النتائج الأخيرة").should("be.visible");
    cy.get(".MuiDataGrid-row").should("have.length.at.least", 1);
  });

  it("uploads audio and verifies result", () => {
    cy.get('button').contains("Audio").click();
    cy.get('input[type="file"]').attachFile("test.wav");
    cy.get('button').contains("رفع").click();
    cy.contains("تم الرفع بنجاح").should("be.visible");
    cy.get(".MuiDataGrid-row").should("have.length.at.least", 1);
  });

  it("uploads image and verifies result", () => {
    cy.get('button').contains("Files").click();
    cy.get('input[type="file"]').attachFile("test.png");
    cy.get('button').contains("رفع").click();
    cy.contains("تم الرفع").should("be.visible");
    cy.get(".MuiDataGrid-row").should("have.length.at.least", 1);
  });

  it("shows auth error on wrong API key", () => {
    window.localStorage.setItem("REACT_APP_API_KEY", "wrong");
    cy.reload();
    cy.get('input[label="Input"]').type("fail");
    cy.get('button').contains("إرسال").click();
    cy.contains("Authentication Error").should("be.visible");
  });
});