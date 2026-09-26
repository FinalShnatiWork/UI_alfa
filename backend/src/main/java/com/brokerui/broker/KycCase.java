package com.brokerui.broker;

import com.brokerui.user.AppUser;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.Table;
import java.time.Instant;

@Entity
@Table(name = "kyc_case")
public class KycCase {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @JsonIgnore
  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "user_id", nullable = false, unique = true)
  private AppUser user;

  @Column(nullable = false, length = 16)
  private String status = "NOT_STARTED";

  @Column(name = "submitted_at")
  private Instant submittedAt;

  @Column(name = "reviewed_at")
  private Instant reviewedAt;

  @Column(columnDefinition = "TEXT")
  private String note;

  public Long getId() {
    return id;
  }

  public AppUser getUser() {
    return user;
  }

  public void setUser(AppUser user) {
    this.user = user;
  }

  public String getStatus() {
    return status;
  }

  public void setStatus(String status) {
    this.status = status;
  }

  public Instant getSubmittedAt() {
    return submittedAt;
  }

  public void setSubmittedAt(Instant submittedAt) {
    this.submittedAt = submittedAt;
  }

  public Instant getReviewedAt() {
    return reviewedAt;
  }

  public void setReviewedAt(Instant reviewedAt) {
    this.reviewedAt = reviewedAt;
  }

  public String getNote() {
    return note;
  }

  public void setNote(String note) {
    this.note = note;
  }
}

