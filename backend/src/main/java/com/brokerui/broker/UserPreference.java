package com.brokerui.broker;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.Instant;
import org.hibernate.annotations.UpdateTimestamp;
import com.brokerui.user.AppUser;

@Entity
@Table(name = "user_preference")
public class UserPreference {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "user_id", nullable = false)
  private AppUser user;

  @Column(name = "pref_key", nullable = false, length = 64)
  private String prefKey;

  @Column(name = "pref_value")
  private String prefValue;

  @UpdateTimestamp
  @Column(name = "updated_at", nullable = false)
  private Instant updatedAt;

  public Long getId() { return id; }

  public AppUser getUser() { return user; }
  public void setUser(AppUser user) { this.user = user; }

  public String getPrefKey() { return prefKey; }
  public void setPrefKey(String prefKey) { this.prefKey = prefKey; }

  public String getPrefValue() { return prefValue; }
  public void setPrefValue(String prefValue) { this.prefValue = prefValue; }

  public Instant getUpdatedAt() { return updatedAt; }
}
